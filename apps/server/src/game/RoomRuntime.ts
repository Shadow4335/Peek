import { randomUUID } from "node:crypto";
import {
  HAPTIC_PATTERN,
  type CatchMethod,
  type FreshFixPayload,
  type GeoFix,
  type HeartbeatPayload,
  type OutOfBoundsEvent,
  type PlayerRole,
  type PlayerRow,
  type RoomRow,
  type RoomStateEvent,
  type RoomStatusEvent,
  type SeekerExposureEvent,
  type TagAttemptPayload,
  type TagAttemptResponse,
  type TagRequestIncomingEvent,
  type TagRequestResolution,
  type TagRequestResponse,
} from "@hideseek/shared";
import { errorMessage, type Logger } from "../log";
import type { CatchResult, GameStore, TagRpcResult } from "../store/types";
import { NOBODY, playerChannel, roomChannel, type GameServer } from "../types";
import type { RuntimeConfig } from "./config";
import { isInsideFence } from "./geofence";
import { nextPingDelayMs } from "./scheduler";

export interface RuntimeDeps {
  io: GameServer;
  store: GameStore;
  config: RuntimeConfig;
  log: Logger;
  /** Called once when the runtime stops (match ended or room vanished). */
  onDisposed: (roomId: string) => void;
}

interface TelemetryEntry {
  fix: GeoFix;
  battery: number | null;
  atMs: number;
}

interface OutOfBoundsState {
  sinceMs: number;
  penalty: boolean;
  last: GeoFix;
}

interface PendingTagRequest {
  id: string;
  seekerId: string;
  hiderId: string;
  expiresAtMs: number;
}

interface FlushWaiter {
  hiderId: string;
  resolve: (gotFix: boolean) => void;
}

const LIVE_STATUSES = new Set(["HEAD_START", "ACTIVE"]);
const iso = (ms: number) => new Date(ms).toISOString();
const pairKey = (seekerId: string, hiderId: string) => `${seekerId}:${hiderId}`;

/**
 * Authoritative in-memory state + timers for one live room (HEAD_START / ACTIVE).
 * Postgres stays the source of truth for status, catches and tag judgement; this
 * class owns timing, fan-out and the socket handshakes.
 */
export class RoomRuntime {
  private readonly log: Logger;
  private readonly io: GameServer;
  private readonly store: GameStore;
  private readonly cfg: RuntimeConfig;

  private readonly players = new Map<string, PlayerRow>();
  private readonly telemetry = new Map<string, TelemetryEntry>();
  private readonly lastHeartbeatAt = new Map<string, number>();
  private readonly seekerFixes = new Map<string, { fix: GeoFix; atMs: number }>();
  private readonly exposures = new Map<string, number>();
  private readonly outOfBounds = new Map<string, OutOfBoundsState>();
  private readonly lastFailedTagAt = new Map<string, number>();
  private readonly tagRequestBlockedUntil = new Map<string, number>();
  private readonly tagsInFlight = new Set<string>();
  private readonly flushWaiters = new Map<string, FlushWaiter>();
  private readonly tagRequests = new Map<string, PendingTagRequest>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  private activeLoopStarted = false;
  private disposed = false;
  private nextPingAtMs: number | null = null;

  static async create(deps: RuntimeDeps, room: RoomRow): Promise<RoomRuntime> {
    const rt = new RoomRuntime(deps, room);
    await rt.load();
    rt.start();
    return rt;
  }

  private constructor(
    private readonly deps: RuntimeDeps,
    private room: RoomRow,
  ) {
    this.io = deps.io;
    this.store = deps.store;
    this.cfg = deps.config;
    this.log = deps.log.child({ roomId: room.id });
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  get roomId() {
    return this.room.id;
  }

  get status() {
    return this.room.status;
  }

  get isDisposed() {
    return this.disposed;
  }

  /** Server-only: next scheduled wave (ms epoch). Never expose to seekers. */
  get nextPingAt() {
    return this.nextPingAtMs;
  }

  roleOf(playerId: string): PlayerRole | null {
    return this.players.get(playerId)?.role ?? null;
  }

  statusEvent(): RoomStatusEvent {
    return {
      roomId: this.room.id,
      status: this.room.status,
      headStartEndsAt: this.room.head_start_ends_at,
      endsAt: this.room.ends_at,
      winner: this.room.winner,
    };
  }

  snapshotFor(playerId: string): RoomStateEvent {
    const p = this.players.get(playerId);
    const role = p?.role ?? "UNASSIGNED";
    const now = Date.now();
    const pending = [...this.tagRequests.values()].find((r) => r.hiderId === playerId);
    return {
      status: this.statusEvent(),
      you: { playerId, role, caught: Boolean(p?.caught_at) },
      exposedSeekers:
        role === "HIDER" || role === "SEEKER"
          ? [...this.exposures]
              .filter(([seekerId, until]) => until > now && (role === "HIDER" || seekerId === playerId))
              .map(([seekerId, until]) => this.exposureEvent(seekerId, until))
          : [],
      outOfBoundsHiders:
        role === "SEEKER" && this.room.status === "ACTIVE"
          ? [...this.outOfBounds]
              .filter(([, s]) => s.penalty)
              .map(([hiderId, s]) => this.oobEvent(hiderId, s))
          : [],
      pendingTagRequest: pending ? this.incomingEvent(pending) : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private async load() {
    const [players, telemetry] = await Promise.all([
      this.store.getPlayers(this.room.id),
      this.store.getTelemetry(this.room.id),
    ]);
    for (const p of players) this.players.set(p.id, p);
    for (const t of telemetry) {
      this.telemetry.set(t.player_id, {
        fix: { lat: t.lat, lng: t.lng, accuracy_m: t.accuracy_m },
        battery: t.battery,
        atMs: Date.parse(t.updated_at),
      });
    }
  }

  private start() {
    this.log.info("runtime started", { status: this.room.status });
    this.broadcastStatus();
    if (this.room.status === "HEAD_START") {
      const ms = Date.parse(this.room.head_start_ends_at ?? "") - Date.now();
      this.setTimer("headStart", Number.isFinite(ms) ? ms : 0, () => this.activate());
    } else if (this.room.status === "ACTIVE") {
      this.beginActiveLoop();
    }
  }

  private async activate() {
    const row = await this.store.transitionRoomStatus(this.room.id, "HEAD_START", "ACTIVE");
    if (row) {
      this.room = row;
      this.broadcastStatus();
      this.beginActiveLoop();
      return;
    }
    // Someone else moved the room (another path / instance) — follow the database.
    const fresh = await this.store.getRoom(this.room.id);
    if (fresh) await this.resync(fresh);
    else this.dispose();
  }

  private beginActiveLoop() {
    if (this.activeLoopStarted || this.disposed) return;
    this.activeLoopStarted = true;
    const endsAtMs = Date.parse(this.room.ends_at ?? "");
    this.setTimer("end", Number.isFinite(endsAtMs) ? endsAtMs - Date.now() : 0, () => this.expire());
    // Penalties earned during HEAD_START become visible to seekers now.
    for (const [hiderId, s] of this.outOfBounds) {
      if (s.penalty) this.emitOutOfBounds(hiderId, s);
    }
    this.schedulePing();
  }

  private async expire() {
    const row = await this.store.transitionRoomStatus(this.room.id, "ACTIVE", "ENDED", "HIDERS");
    if (row) {
      this.finish(row);
      return;
    }
    const fresh = await this.store.getRoom(this.room.id);
    if (fresh) await this.resync(fresh);
    else this.dispose();
  }

  /** Reconcile with the database row (manager sweep, or after a lost CAS race). */
  async resync(dbRoom: RoomRow) {
    if (this.disposed) return;
    const prev = this.room.status;
    this.room = dbRoom;
    if (!LIVE_STATUSES.has(dbRoom.status)) {
      this.finish(dbRoom);
      return;
    }
    if (prev === "HEAD_START" && dbRoom.status === "ACTIVE") {
      this.clearTimer("headStart");
      this.broadcastStatus();
      this.beginActiveLoop();
    }
    await this.refreshPlayers();
  }

  /** Picks up catches made outside this runtime (e.g. a direct self_surrender RPC). */
  private async refreshPlayers() {
    const rows = await this.store.getPlayers(this.room.id);
    for (const row of rows) {
      const local = this.players.get(row.id);
      if (local && !local.caught_at && row.caught_at && row.role === "HIDER") {
        const remaining = rows.filter((p) => p.role === "HIDER" && !p.caught_at).length;
        this.players.set(row.id, row);
        this.cleanupCaughtHider(row.id);
        this.io.to(roomChannel(this.room.id)).emit("hider:caught", {
          playerId: row.id,
          byPlayerId: row.caught_by_player_id,
          method: row.catch_method ?? "PROXIMITY",
          hidersRemaining: remaining,
        });
      } else {
        this.players.set(row.id, row);
      }
    }
  }

  private finish(room: RoomRow) {
    if (this.disposed) return;
    this.room = room;
    this.log.info("match finished", { status: room.status, winner: room.winner });
    this.broadcastStatus();
    this.dispose();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const w of this.flushWaiters.values()) w.resolve(false);
    this.flushWaiters.clear();
    for (const req of this.tagRequests.values()) this.emitTagResolved(req, "CANCELLED");
    this.tagRequests.clear();
    this.nextPingAtMs = null;
    this.deps.onDisposed(this.room.id);
  }

  // ---------------------------------------------------------------------------
  // Ping scheduler
  // ---------------------------------------------------------------------------

  private schedulePing() {
    if (this.disposed || this.room.status !== "ACTIVE") return;
    const now = Date.now();
    const endsAtMs = Date.parse(this.room.ends_at ?? "");
    const delay = nextPingDelayMs({
      minSecs: this.room.ping_interval_min_secs,
      maxSecs: this.room.ping_interval_max_secs,
      nowMs: now,
      endsAtMs,
      endgameWindowMs: this.cfg.endgameWindowMs,
      endgameMultiplier: this.cfg.endgameMultiplier,
      random: this.cfg.random,
    });
    const fireAt = now + delay;
    if (!Number.isFinite(endsAtMs) || fireAt >= endsAtMs) {
      this.nextPingAtMs = null;
      return;
    }
    this.nextPingAtMs = fireAt;
    this.setTimer("preWarning", delay - this.cfg.preWarningMs, () => {
      this.to(this.hiderIds()).emit("ping:pre_warning", {
        inMs: Math.max(0, fireAt - Date.now()),
        haptic: [...HAPTIC_PATTERN],
      });
    });
    this.setTimer("ping", delay, () => this.firePing());
  }

  private async firePing() {
    try {
      const snaps = await this.store.recordPingWave(this.room.id);
      // The RPC bumps ping_wave_count even when no hider has telemetry yet.
      const waveNumber = snaps[0]?.wave_number ?? this.room.ping_wave_count + 1;
      this.room.ping_wave_count = waveNumber;
      if (!this.disposed) {
        this.io.to(roomChannel(this.room.id)).emit("ping:wave", {
          roomId: this.room.id,
          waveNumber,
          firedAt: new Date().toISOString(),
          pings: snaps.map((s) => ({
            playerId: s.player_id,
            lat: s.lat,
            lng: s.lng,
            accuracy_m: s.accuracy_m,
            stale: s.stale,
            heartbeatAt: s.heartbeat_at,
          })),
        });
      }
      this.log.info("ping wave", { waveNumber, hiders: snaps.length });
    } catch (err) {
      this.log.error("ping wave failed", { err: errorMessage(err) });
    } finally {
      this.schedulePing();
    }
  }

  // ---------------------------------------------------------------------------
  // Hider telemetry + geofence
  // ---------------------------------------------------------------------------

  /** Returns true when the fix was accepted and persisted. */
  async ingestHeartbeat(playerId: string, hb: HeartbeatPayload, opts: { fresh: boolean }) {
    const p = this.players.get(playerId);
    if (this.disposed || !p || p.role !== "HIDER" || p.caught_at) return false;
    if (!LIVE_STATUSES.has(this.room.status)) return false;

    const now = Date.now();
    if (!opts.fresh) {
      const last = this.lastHeartbeatAt.get(playerId);
      if (last !== undefined && now - last < this.cfg.heartbeatMinIntervalMs) return false;
    }
    const fixTs = Date.parse(hb.updated_at);
    const atMs = Number.isFinite(fixTs) ? Math.min(fixTs, now) : now;
    const prev = this.telemetry.get(playerId);
    if (prev && atMs < prev.atMs) return false; // out-of-order delivery
    this.lastHeartbeatAt.set(playerId, now);

    const fix: GeoFix = { lat: hb.lat, lng: hb.lng, accuracy_m: hb.accuracy_m };
    this.telemetry.set(playerId, { fix, battery: hb.battery, atMs });
    try {
      await this.store.upsertTelemetry({
        player_id: playerId,
        room_id: this.room.id,
        lat: fix.lat,
        lng: fix.lng,
        accuracy_m: fix.accuracy_m,
        battery: hb.battery,
        updated_at: iso(atMs),
      });
    } catch (err) {
      this.log.error("telemetry upsert failed", { playerId, err: errorMessage(err) });
      return false;
    }
    this.checkBoundary(playerId, fix, now);
    return true;
  }

  private checkBoundary(playerId: string, fix: GeoFix, now: number) {
    const inside = isInsideFence(fix, this.room.geofence_buffered);
    const state = this.outOfBounds.get(playerId);

    if (inside) {
      if (!state) return;
      this.clearTimer(`oob:${playerId}`);
      this.outOfBounds.delete(playerId);
      this.persistOutOfBounds(playerId, null);
      if (state.penalty) {
        this.io.to(roomChannel(this.room.id)).emit("hider:back_in_bounds", { playerId });
      }
      return;
    }

    if (state) {
      state.last = fix;
      if (state.penalty && this.room.status === "ACTIVE") this.emitOutOfBounds(playerId, state);
      return;
    }

    const fresh: OutOfBoundsState = { sinceMs: now, penalty: false, last: fix };
    this.outOfBounds.set(playerId, fresh);
    this.persistOutOfBounds(playerId, iso(now));
    this.io.to(playerChannel(playerId)).emit("hider:boundary_warning", {
      graceMs: this.cfg.outOfBoundsGraceMs,
      haptic: [...HAPTIC_PATTERN],
    });
    this.setTimer(`oob:${playerId}`, this.cfg.outOfBoundsGraceMs, () => {
      const s = this.outOfBounds.get(playerId);
      if (!s) return;
      s.penalty = true;
      this.log.info("out-of-bounds penalty", { playerId });
      if (this.room.status === "ACTIVE") this.emitOutOfBounds(playerId, s);
    });
  }

  private persistOutOfBounds(playerId: string, since: string | null) {
    this.store
      .setOutOfBounds(playerId, since)
      .catch((err) => this.log.warn("persist out_of_bounds failed", { err: errorMessage(err) }));
  }

  private oobEvent(playerId: string, s: OutOfBoundsState): OutOfBoundsEvent {
    return { playerId, since: iso(s.sinceMs), location: s.last };
  }

  private emitOutOfBounds(playerId: string, s: OutOfBoundsState) {
    // Penalty: seekers see the live fix. The hider gets it too (to show "you are exposed").
    this.to([...this.seekerIds(), playerId]).emit("hider:out_of_bounds", this.oobEvent(playerId, s));
  }

  // ---------------------------------------------------------------------------
  // Seeker location + exposure penalty
  // ---------------------------------------------------------------------------

  onSeekerLocation(playerId: string, fix: GeoFix) {
    if (this.roleOf(playerId) !== "SEEKER" || this.room.status !== "ACTIVE") return;
    const now = Date.now();
    const prev = this.seekerFixes.get(playerId);
    if (prev && now - prev.atMs < this.cfg.seekerLocationMinIntervalMs) return;
    this.seekerFixes.set(playerId, { fix, atMs: now });

    const until = this.exposures.get(playerId);
    if (until === undefined) return;
    if (until <= now) {
      this.exposures.delete(playerId);
      return;
    }
    this.to(this.hiderIds()).emit("seeker:exposed", this.exposureEvent(playerId, until));
  }

  private exposureEvent(seekerId: string, until: number): SeekerExposureEvent {
    return {
      seekerPlayerId: seekerId,
      location: this.seekerFixes.get(seekerId)?.fix ?? null,
      until: iso(until),
    };
  }

  private startExposure(seekerId: string, untilMs: number) {
    this.exposures.set(seekerId, untilMs);
    this.log.info("seeker exposed", { seekerId });
    // Hiders see the seeker; the seeker is told they're exposed (penalty is public, not secret).
    this.to([...this.hiderIds(), seekerId]).emit("seeker:exposed", this.exposureEvent(seekerId, untilMs));
  }

  // ---------------------------------------------------------------------------
  // Proximity tagging (Option C) + FORCE_GPS_FLUSH handshake
  // ---------------------------------------------------------------------------

  async handleTag(seekerId: string, payload: TagAttemptPayload): Promise<TagAttemptResponse> {
    if (this.roleOf(seekerId) !== "SEEKER" || this.room.status !== "ACTIVE" || this.disposed) {
      return { result: "INVALID" };
    }
    if (this.tagsInFlight.has(seekerId)) return { result: "INVALID" };
    this.tagsInFlight.add(seekerId);
    try {
      this.seekerFixes.set(seekerId, { fix: payload.seeker, atMs: Date.now() });
      const args = {
        roomId: this.room.id,
        seekerPlayerId: seekerId,
        hiderPlayerId: payload.hiderPlayerId,
        seekerLat: payload.seeker.lat,
        seekerLng: payload.seeker.lng,
        seekerAccuracyM: payload.seeker.accuracy_m,
      };
      let r = await this.store.attemptProximityTag({ ...args, freshFixAttempted: false });
      if (r.result === "NEEDS_FRESH_FIX") {
        await this.requestFreshFix(payload.hiderPlayerId);
        r = await this.store.attemptProximityTag({ ...args, freshFixAttempted: true });
      }
      return await this.afterTag(seekerId, payload.hiderPlayerId, r);
    } catch (err) {
      this.log.error("tag failed", { seekerId, err: errorMessage(err) });
      return { result: "INVALID" };
    } finally {
      this.tagsInFlight.delete(seekerId);
    }
  }

  /** Strips server-only fields; the seeker never learns distances or exposure details. */
  private async afterTag(seekerId: string, hiderId: string, r: TagRpcResult): Promise<TagAttemptResponse> {
    switch (r.result) {
      case "TAGGED":
        await this.onCatch(hiderId, seekerId, "PROXIMITY", r);
        return { result: "TAGGED" };
      case "OUT_OF_RANGE":
        this.lastFailedTagAt.set(pairKey(seekerId, hiderId), Date.now());
        if (r.exposure_triggered && r.exposed_until) {
          this.startExposure(seekerId, Date.parse(r.exposed_until));
        }
        return { result: "OUT_OF_RANGE", cooldownUntil: r.cooldown_until, tagRequestEligible: true };
      case "COOLDOWN":
        return { result: "COOLDOWN", cooldownUntil: r.cooldown_until };
      default:
        return { result: "INVALID" };
    }
  }

  /** Emits FORCE_GPS_FLUSH and waits up to freshFixTimeoutMs for "hider:fresh_fix". */
  private requestFreshFix(hiderId: string): Promise<boolean> {
    const channel = playerChannel(hiderId);
    if (!this.io.sockets.adapter.rooms.get(channel)?.size) return Promise.resolve(false);
    const requestId = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => waiter.resolve(false), this.cfg.freshFixTimeoutMs);
      const waiter: FlushWaiter = {
        hiderId,
        resolve: (gotFix) => {
          clearTimeout(timer);
          this.flushWaiters.delete(requestId);
          resolve(gotFix);
        },
      };
      this.flushWaiters.set(requestId, waiter);
      this.io.to(channel).emit("FORCE_GPS_FLUSH", {
        requestId,
        timeoutMs: this.cfg.freshFixTimeoutMs,
      });
    });
  }

  async onFreshFix(playerId: string, payload: FreshFixPayload) {
    const waiter = this.flushWaiters.get(payload.requestId);
    const accepted = await this.ingestHeartbeat(playerId, payload, { fresh: true });
    if (waiter && waiter.hiderId === playerId) waiter.resolve(accepted);
  }

  // ---------------------------------------------------------------------------
  // Catches
  // ---------------------------------------------------------------------------

  async onCatch(hiderId: string, seekerId: string | null, method: CatchMethod, result: CatchResult) {
    if (!result.caught || this.disposed) return;
    const hider = this.players.get(hiderId);
    if (hider) {
      hider.caught_at = new Date().toISOString();
      hider.caught_by_player_id = seekerId;
      hider.catch_method = method;
    }
    const seeker = seekerId ? this.players.get(seekerId) : undefined;
    if (seeker) seeker.catches_count += 1;
    this.cleanupCaughtHider(hiderId);

    this.log.info("hider caught", { hiderId, seekerId, method });
    this.io.to(roomChannel(this.room.id)).emit("hider:caught", {
      playerId: hiderId,
      byPlayerId: seekerId,
      method,
      hidersRemaining: result.hiders_remaining ?? this.hiderIds().length,
    });

    if (result.match_ended) {
      const fresh = await this.store.getRoom(this.room.id).catch(() => null);
      this.finish(
        fresh ?? { ...this.room, status: "ENDED", winner: "SEEKERS", ended_at: new Date().toISOString() },
      );
    }
  }

  private cleanupCaughtHider(hiderId: string) {
    this.telemetry.delete(hiderId);
    this.lastHeartbeatAt.delete(hiderId);
    const oob = this.outOfBounds.get(hiderId);
    if (oob) {
      this.clearTimer(`oob:${hiderId}`);
      this.outOfBounds.delete(hiderId);
      if (oob.penalty) this.io.to(roomChannel(this.room.id)).emit("hider:back_in_bounds", { playerId: hiderId });
    }
    for (const [id, w] of this.flushWaiters) {
      if (w.hiderId === hiderId) {
        this.flushWaiters.delete(id);
        w.resolve(false);
      }
    }
    for (const req of [...this.tagRequests.values()]) {
      if (req.hiderId === hiderId) this.resolveTagRequest(req.id, "CANCELLED");
    }
  }

  // ---------------------------------------------------------------------------
  // Manual "Send Tag Request" fallback (indoor / canopy)
  // ---------------------------------------------------------------------------

  requestTag(seekerId: string, hiderId: string): TagRequestResponse {
    const seeker = this.players.get(seekerId);
    const hider = this.players.get(hiderId);
    if (this.disposed || this.room.status !== "ACTIVE" || seeker?.role !== "SEEKER") {
      return { ok: false, error: "INVALID" };
    }
    if (!hider || hider.role !== "HIDER" || hider.caught_at) return { ok: false, error: "HIDER_UNAVAILABLE" };

    const now = Date.now();
    const key = pairKey(seekerId, hiderId);
    const failedAt = this.lastFailedTagAt.get(key);
    const tel = this.telemetry.get(hiderId);
    const eligible =
      (failedAt !== undefined && now - failedAt <= this.cfg.tagRequestAfterFailMs) ||
      !tel ||
      now - tel.atMs > this.cfg.tagRequestEligibleStaleMs;
    if (!eligible) return { ok: false, error: "NOT_ELIGIBLE" };
    if ((this.tagRequestBlockedUntil.get(key) ?? 0) > now) return { ok: false, error: "COOLDOWN" };

    const pending = [...this.tagRequests.values()];
    if (pending.some((r) => r.seekerId === seekerId)) return { ok: false, error: "REQUEST_PENDING" };
    if (pending.some((r) => r.hiderId === hiderId)) return { ok: false, error: "HIDER_BUSY" };

    const req: PendingTagRequest = {
      id: randomUUID(),
      seekerId,
      hiderId,
      expiresAtMs: now + this.cfg.tagRequestConfirmMs,
    };
    this.tagRequests.set(req.id, req);
    this.setTimer(`tagRequest:${req.id}`, this.cfg.tagRequestConfirmMs, () =>
      this.resolveTagRequest(req.id, "EXPIRED"),
    );
    this.io.to(playerChannel(hiderId)).emit("tag_request:incoming", this.incomingEvent(req));
    return { ok: true, requestId: req.id, expiresAt: iso(req.expiresAtMs) };
  }

  async respondTagRequest(hiderId: string, requestId: string, accept: boolean) {
    const req = this.tagRequests.get(requestId);
    if (!req || req.hiderId !== hiderId) return;
    if (!accept) {
      this.resolveTagRequest(requestId, "DECLINED");
      return;
    }
    // Claim the request before awaiting so the expiry timer / a double tap can't race us.
    this.tagRequests.delete(requestId);
    this.clearTimer(`tagRequest:${requestId}`);
    if (Date.now() > req.expiresAtMs) {
      this.emitTagResolved(req, "EXPIRED");
      return;
    }
    let result: CatchResult;
    try {
      result = await this.store.confirmManualTag(this.room.id, req.seekerId, req.hiderId);
    } catch (err) {
      this.log.error("confirm_manual_tag failed", { err: errorMessage(err) });
      this.emitTagResolved(req, "CANCELLED");
      return;
    }
    this.emitTagResolved(req, result.caught ? "ACCEPTED" : "CANCELLED");
    await this.onCatch(req.hiderId, req.seekerId, "TAG_REQUEST", result);
  }

  private resolveTagRequest(requestId: string, resolution: TagRequestResolution) {
    const req = this.tagRequests.get(requestId);
    if (!req) return;
    this.tagRequests.delete(requestId);
    this.clearTimer(`tagRequest:${requestId}`);
    if (resolution === "DECLINED" || resolution === "EXPIRED") {
      this.tagRequestBlockedUntil.set(
        pairKey(req.seekerId, req.hiderId),
        Date.now() + this.cfg.tagRequestRetryCooldownMs,
      );
    }
    this.emitTagResolved(req, resolution);
  }

  private emitTagResolved(req: PendingTagRequest, resolution: TagRequestResolution) {
    this.to([req.seekerId, req.hiderId]).emit("tag_request:resolved", {
      requestId: req.id,
      seekerPlayerId: req.seekerId,
      hiderPlayerId: req.hiderId,
      resolution,
    });
  }

  private incomingEvent(req: PendingTagRequest): TagRequestIncomingEvent {
    return {
      requestId: req.id,
      seekerPlayerId: req.seekerId,
      seekerName: this.players.get(req.seekerId)?.display_name ?? "Seeker",
      expiresAt: iso(req.expiresAtMs),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  broadcastStatus() {
    this.io.to(roomChannel(this.room.id)).emit("room:status", this.statusEvent());
  }

  /** Uncaught hiders. */
  hiderIds() {
    return [...this.players.values()].filter((p) => p.role === "HIDER" && !p.caught_at).map((p) => p.id);
  }

  seekerIds() {
    return [...this.players.values()].filter((p) => p.role === "SEEKER").map((p) => p.id);
  }

  /** Targets specific players. Empty list is a no-op (never a room-wide broadcast). */
  private to(playerIds: string[]) {
    return this.io.to(playerIds.length ? playerIds.map(playerChannel) : NOBODY);
  }

  private setTimer(key: string, ms: number, fn: () => unknown) {
    this.clearTimer(key);
    const t = setTimeout(
      () => {
        this.timers.delete(key);
        if (this.disposed) return;
        Promise.resolve()
          .then(fn)
          .catch((err) => this.log.error("timer failed", { key, err: errorMessage(err) }));
      },
      Math.max(0, ms),
    );
    this.timers.set(key, t);
  }

  private clearTimer(key: string) {
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
  }
}

