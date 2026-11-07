import { randomUUID } from "node:crypto";
import {
  effectiveTagDistance,
  SEEKER_EXPOSURE_MS,
  TAG_FAIL_COOLDOWN_MS,
  TAG_FRESH_FIX_MAX_AGE_MS,
  TAG_STRIKE_WINDOW_MS,
  type CatchMethod,
  type HiderTelemetryRow,
  type MatchWinner,
  type PingSnapshotRow,
  type PlayerRole,
  type PlayerRow,
  type RoomRow,
  type RoomStatus,
} from "@hideseek/shared";
import type { CatchResult, GameStore, TagRpcArgs, TagRpcResult, UserScopedStore } from "../src/store/types";

const iso = (ms: number) => new Date(ms).toISOString();

/** ~200 m square around (40, -74) and a 12 m-ish buffered copy. */
export const CENTER = { lat: 40, lng: -74 };
const d = 0.0009;
const bd = d + 0.00012;
const square = (h: number) => ({
  type: "Polygon" as const,
  coordinates: [
    [
      [-74 - h, 40 - h],
      [-74 + h, 40 - h],
      [-74 + h, 40 + h],
      [-74 - h, 40 + h],
      [-74 - h, 40 - h],
    ] as [number, number][],
  ],
});

/** Point `meters` north of CENTER. */
export const north = (meters: number) => ({ lat: 40 + meters / 111_195, lng: -74 });

/**
 * In-memory GameStore mirroring the SQL RPC semantics closely enough to exercise
 * the server's orchestration. The real SQL is covered by the PGlite suite.
 */
export class FakeStore implements GameStore {
  rooms = new Map<string, RoomRow>();
  players = new Map<string, PlayerRow>();
  telemetry = new Map<string, HiderTelemetryRow>();
  pings: PingSnapshotRow[] = [];
  tokens = new Map<string, string>();
  private strikes: Array<{ seekerId: string; atMs: number }> = [];

  createRoom(overrides: Partial<RoomRow> = {}): RoomRow {
    const now = Date.now();
    const room: RoomRow = {
      id: randomUUID(),
      code: "TEST42",
      host_user_id: randomUUID(),
      status: "LOBBY",
      max_players: 10,
      seeker_count: 2,
      game_duration_mins: 10,
      head_start_secs: 0.2,
      ping_interval_min_secs: 0.4,
      ping_interval_max_secs: 0.4,
      geofence: square(d),
      geofence_buffered: square(bd),
      geofence_area_m2: 40_000,
      head_start_ends_at: null,
      started_at: null,
      ends_at: null,
      ended_at: null,
      winner: null,
      ping_wave_count: 0,
      rematch_code: null,
      created_at: iso(now),
      updated_at: iso(now),
      ...overrides,
    };
    this.rooms.set(room.id, room);
    return room;
  }

  /** Puts the room straight into ACTIVE with `secs` left. */
  activate(roomId: string, secs = 600) {
    const room = this.rooms.get(roomId)!;
    const now = Date.now();
    Object.assign(room, {
      status: "ACTIVE",
      started_at: iso(now),
      head_start_ends_at: iso(now),
      ends_at: iso(now + secs * 1000),
    });
  }

  addPlayer(roomId: string, name: string, role: PlayerRole, opts: { host?: boolean } = {}) {
    const userId = randomUUID();
    const token = `token-${userId}`;
    this.tokens.set(token, userId);
    const now = iso(Date.now());
    const p: PlayerRow = {
      id: randomUUID(),
      room_id: roomId,
      user_id: userId,
      display_name: name,
      role,
      is_host: Boolean(opts.host),
      is_ready: true,
      ready_checked_at: now,
      caught_at: null,
      caught_by_player_id: null,
      catch_method: null,
      catches_count: 0,
      last_failed_tag_at: null,
      exposed_until: null,
      out_of_bounds_since: null,
      last_seen_at: now,
      joined_at: now,
    };
    this.players.set(p.id, p);
    if (opts.host) this.rooms.get(roomId)!.host_user_id = userId;
    return { player: p, token };
  }

  clearCooldown(seekerId: string) {
    this.players.get(seekerId)!.last_failed_tag_at = null;
  }

  // --- GameStore ------------------------------------------------------------

  async getRoom(id: string) {
    const r = this.rooms.get(id);
    return r ? { ...r } : null;
  }
  async listLiveRooms() {
    return [...this.rooms.values()].filter((r) => r.status === "HEAD_START" || r.status === "ACTIVE");
  }
  async listRecentRooms(limit: number) {
    return [...this.rooms.values()]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }
  async getPlayersForRooms(roomIds: string[]) {
    const ids = new Set(roomIds);
    return [...this.players.values()].filter((p) => ids.has(p.room_id)).map((p) => ({ ...p }));
  }
  async removePlayer(playerId: string) {
    this.players.delete(playerId);
    this.telemetry.delete(playerId);
  }
  async getPlayers(roomId: string) {
    return [...this.players.values()].filter((p) => p.room_id === roomId).map((p) => ({ ...p }));
  }
  async getPlayerByUser(roomId: string, userId: string) {
    return [...this.players.values()].find((p) => p.room_id === roomId && p.user_id === userId) ?? null;
  }
  async getTelemetry(roomId: string) {
    return [...this.telemetry.values()].filter((t) => t.room_id === roomId);
  }
  async upsertTelemetry(row: HiderTelemetryRow) {
    this.telemetry.set(row.player_id, { ...row });
  }
  async setOutOfBounds(playerId: string, since: string | null) {
    this.players.get(playerId)!.out_of_bounds_since = since;
  }
  async recordPingWave(roomId: string) {
    const room = this.rooms.get(roomId)!;
    if (room.status !== "ACTIVE") return [];
    room.ping_wave_count += 1;
    const now = Date.now();
    const rows = [...this.telemetry.values()]
      .filter((t) => t.room_id === roomId && !this.players.get(t.player_id)!.caught_at)
      .map<PingSnapshotRow>((t) => ({
        id: randomUUID(),
        room_id: roomId,
        wave_number: room.ping_wave_count,
        player_id: t.player_id,
        lat: t.lat,
        lng: t.lng,
        accuracy_m: t.accuracy_m,
        stale: now - Date.parse(t.updated_at) > 20_000,
        heartbeat_at: t.updated_at,
        created_at: iso(now),
      }));
    this.pings.push(...rows);
    return rows;
  }
  async transitionRoomStatus(roomId: string, from: RoomStatus, to: RoomStatus, winner: MatchWinner | null = null) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== from) return null;
    room.status = to;
    if (to === "ENDED") {
      room.ended_at = iso(Date.now());
      room.winner = winner;
    }
    return { ...room };
  }

  private applyCatch(roomId: string, hiderId: string, seekerId: string | null, method: CatchMethod): CatchResult {
    const hider = this.players.get(hiderId);
    if (!hider || hider.caught_at || hider.role !== "HIDER") return { caught: false, match_ended: false };
    hider.caught_at = iso(Date.now());
    hider.caught_by_player_id = seekerId;
    hider.catch_method = method;
    if (seekerId) this.players.get(seekerId)!.catches_count += 1;
    this.telemetry.delete(hiderId);
    const remaining = [...this.players.values()].filter(
      (p) => p.room_id === roomId && p.role === "HIDER" && !p.caught_at,
    ).length;
    let ended = false;
    if (remaining === 0) {
      const room = this.rooms.get(roomId)!;
      Object.assign(room, { status: "ENDED", winner: "SEEKERS", ended_at: iso(Date.now()) });
      ended = true;
    }
    return { caught: true, match_ended: ended, winner: ended ? "SEEKERS" : null, hiders_remaining: remaining };
  }

  async attemptProximityTag(a: TagRpcArgs): Promise<TagRpcResult> {
    const now = Date.now();
    const room = this.rooms.get(a.roomId);
    if (!room || room.status !== "ACTIVE" || now >= Date.parse(room.ends_at!)) {
      return { result: "INVALID", reason: "ROOM_NOT_ACTIVE" };
    }
    const seeker = this.players.get(a.seekerPlayerId);
    if (!seeker || seeker.role !== "SEEKER") return { result: "INVALID", reason: "NOT_A_SEEKER" };
    const lastFail = seeker.last_failed_tag_at ? Date.parse(seeker.last_failed_tag_at) : null;
    if (lastFail && lastFail + TAG_FAIL_COOLDOWN_MS > now) {
      return { result: "COOLDOWN", cooldown_until: iso(lastFail + TAG_FAIL_COOLDOWN_MS) };
    }
    const hider = this.players.get(a.hiderPlayerId);
    if (!hider || hider.role !== "HIDER" || hider.caught_at) return { result: "INVALID", reason: "HIDER_UNAVAILABLE" };

    const tel = this.telemetry.get(a.hiderPlayerId);
    const dist = tel
      ? effectiveTagDistance(
          { lat: a.seekerLat, lng: a.seekerLng, accuracy_m: a.seekerAccuracyM },
          { lat: tel.lat, lng: tel.lng, accuracy_m: tel.accuracy_m },
        )
      : null;
    const ageMs = tel ? now - Date.parse(tel.updated_at) : Infinity;

    if (!a.freshFixAttempted && (!dist || ageMs > TAG_FRESH_FIX_MAX_AGE_MS || dist.borderline)) {
      return { result: "NEEDS_FRESH_FIX" };
    }
    if (dist?.success) {
      return { result: "TAGGED", ...this.applyCatch(a.roomId, hider.id, seeker.id, "PROXIMITY") };
    }
    const strike = Boolean(dist);
    if (strike) this.strikes.push({ seekerId: seeker.id, atMs: now });
    const strikes = this.strikes.filter((s) => s.seekerId === seeker.id && now - s.atMs < TAG_STRIKE_WINDOW_MS).length;
    const exposureTriggered = strike && strikes >= 2;
    if (exposureTriggered) seeker.exposed_until = iso(now + SEEKER_EXPOSURE_MS);
    seeker.last_failed_tag_at = iso(now);
    return {
      result: "OUT_OF_RANGE",
      cooldown_until: iso(now + TAG_FAIL_COOLDOWN_MS),
      tag_request_eligible: true,
      exposure_triggered: exposureTriggered,
      exposed_until: seeker.exposed_until,
    };
  }

  async confirmManualTag(roomId: string, seekerId: string, hiderId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "ACTIVE") return { caught: false, reason: "ROOM_NOT_ACTIVE" };
    return this.applyCatch(roomId, hiderId, seekerId, "TAG_REQUEST");
  }

  asUser(token: string): UserScopedStore {
    const userId = this.tokens.get(token);
    return {
      startMatch: async (roomId) => {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error("ROOM_NOT_FOUND");
        if (room.host_user_id !== userId) throw new Error("NOT_HOST");
        if (room.status !== "LOBBY") throw new Error("ROOM_NOT_IN_LOBBY");
        const now = Date.now();
        const hs = now + room.head_start_secs * 1000;
        Object.assign(room, {
          status: "HEAD_START",
          started_at: iso(now),
          head_start_ends_at: iso(hs),
          ends_at: iso(hs + room.game_duration_mins * 60_000),
        });
        return { ...room };
      },
      selfSurrender: async (roomId) => {
        const p = [...this.players.values()].find((x) => x.room_id === roomId && x.user_id === userId);
        if (!p || p.role !== "HIDER" || p.caught_at) throw new Error("NOT_AN_ACTIVE_HIDER");
        return this.applyCatch(roomId, p.id, null, "SELF_SURRENDER");
      },
    };
  }

  async verifyAccessToken(token: string) {
    return this.tokens.get(token) ?? null;
  }
}
