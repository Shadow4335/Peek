"use client";

import type { PingSnapshotRow, PlayerRole, PlayerRow, RoomRow, RoomStatus } from "@hideseek/shared";
import { useMemo, useState } from "react";
import { MatchScreen } from "@/components/match/MatchScreen";
import { bufferFence, circlePolygon } from "@/lib/geofence";
import type { GameSocket } from "@/lib/socket";

const C: [number, number] = [-73.9654, 40.7829];
const fence = circlePolygon(C, 220);
const iso = (ms: number) => new Date(ms).toISOString();

type Handler = (...args: unknown[]) => void;

/** Minimal stand-in for the Socket.io client + game server, driven by the QA panel. */
class FakeSocket {
  connected = true;
  log: string[] = [];
  private handlers = new Map<string, Set<Handler>>();
  private failedOnce = false;
  private cooldownUntil = 0;

  on(ev: string, h: Handler) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, new Set());
    this.handlers.get(ev)!.add(h);
    return this;
  }
  off(ev: string, h: Handler) {
    this.handlers.get(ev)?.delete(h);
    return this;
  }
  /** Server → client. */
  serverEmit(ev: string, payload?: unknown) {
    this.handlers.get(ev)?.forEach((h) => h(payload));
  }
  emit(ev: string, payload?: unknown) {
    this.log = [`${new Date().toLocaleTimeString()} ${ev}`, ...this.log].slice(0, 6);
    if (ev === "hider:tag_request_response") {
      const p = payload as { requestId: string; accept: boolean };
      this.serverEmit("tag_request:resolved", {
        requestId: p.requestId,
        seekerPlayerId: "s1",
        hiderPlayerId: "me",
        resolution: p.accept ? "ACCEPTED" : "DECLINED",
      });
      if (p.accept) this.serverEmit("hider:caught", { playerId: "me", byPlayerId: "s1", method: "TAG_REQUEST", hidersRemaining: 1 });
    }
    return this;
  }
  timeout() {
    return this;
  }
  async emitWithAck(ev: string, payload?: unknown): Promise<unknown> {
    this.emit(ev, payload);
    await new Promise((r) => setTimeout(r, 400));
    const now = Date.now();
    switch (ev) {
      case "seeker:tag": {
        if (now < this.cooldownUntil) return { result: "COOLDOWN", cooldownUntil: iso(this.cooldownUntil) };
        if (!this.failedOnce) {
          this.failedOnce = true;
          this.cooldownUntil = now + 20_000;
          return { result: "OUT_OF_RANGE", cooldownUntil: iso(this.cooldownUntil), tagRequestEligible: true };
        }
        const { hiderPlayerId } = payload as { hiderPlayerId: string };
        setTimeout(() => this.serverEmit("hider:caught", { playerId: hiderPlayerId, byPlayerId: "me", method: "PROXIMITY", hidersRemaining: 1 }), 100);
        return { result: "TAGGED" };
      }
      case "seeker:tag_request": {
        const requestId = crypto.randomUUID();
        const { hiderPlayerId } = payload as { hiderPlayerId: string };
        setTimeout(
          () => this.serverEmit("tag_request:resolved", { requestId, seekerPlayerId: "me", hiderPlayerId, resolution: "ACCEPTED" }),
          3000,
        );
        return { ok: true, requestId, expiresAt: iso(now + 15_000) };
      }
      case "hider:self_surrender":
        setTimeout(() => this.serverEmit("hider:caught", { playerId: "me", byPlayerId: null, method: "SELF_SURRENDER", hidersRemaining: 1 }), 100);
        return { ok: true };
      default:
        return { ok: true };
    }
  }
}

const mk = (id: string, name: string, role: PlayerRole, extra: Partial<PlayerRow> = {}): PlayerRow => ({
  id,
  room_id: "r1",
  user_id: `u-${id}`,
  display_name: name,
  role,
  is_host: false,
  is_ready: true,
  ready_checked_at: null,
  caught_at: null,
  caught_by_player_id: null,
  catch_method: null,
  catches_count: 0,
  last_failed_tag_at: null,
  exposed_until: null,
  out_of_bounds_since: null,
  last_seen_at: iso(Date.now()),
  joined_at: iso(Date.now()),
  ...extra,
});

const off = (dLat: number, dLng: number) => ({ lat: C[1] + dLat, lng: C[0] + dLng });

export function MatchFixture() {
  const [role, setRole] = useState<PlayerRole | null>(null);
  const [status, setStatus] = useState<RoomStatus>("ACTIVE");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [panel, setPanel] = useState(false);
  const [wave, setWave] = useState(0);
  const socket = useMemo(() => new FakeSocket(), []);
  // Set on click — Date.now() during prerender is flagged by cacheComponents.
  const [startedAt, setStartedAt] = useState(0);

  if (!role) return <RolePicker onPick={(r, st) => {
    setStartedAt(Date.now());
    setStatus(st);
    setRole(r);
    setPlayers(rosterFor(r));
  }} />;

  const room: RoomRow = {
    id: "r1",
    code: "HIDE42",
    host_user_id: "u-me",
    status,
    max_players: 6,
    seeker_count: 2,
    game_duration_mins: 30,
    head_start_secs: 120,
    ping_interval_min_secs: 60,
    ping_interval_max_secs: 120,
    geofence: fence,
    geofence_buffered: bufferFence(fence)!,
    geofence_area_m2: Math.PI * 220 * 220,
    head_start_ends_at: iso(startedAt + 95_000),
    started_at: iso(startedAt),
    ends_at: status === "HEAD_START" ? iso(startedAt + 95_000 + 30 * 60_000) : iso(startedAt + 11 * 60_000),
    ended_at: status === "ENDED" ? iso(startedAt + 95_000 + 9 * 60_000) : null,
    winner: status === "ENDED" ? "SEEKERS" : null,
    ping_wave_count: wave,
    created_at: iso(startedAt),
    updated_at: iso(startedAt),
  };

  const sim: Array<[string, () => void]> = [
    [
      "Ping wave",
      () => {
        const n = wave + 1;
        setWave(n);
        const j = n * 0.00015;
        socket.serverEmit("ping:wave", {
          roomId: "r1",
          waveNumber: n,
          firedAt: iso(Date.now()),
          pings: [
            { playerId: role === "HIDER" ? "me" : "h1", ...off(0.0004 - j, -0.0006 + j), accuracy_m: 18, stale: false, heartbeatAt: iso(Date.now()) },
            { playerId: "h2", ...off(-0.0008 + j / 2, 0.0009), accuracy_m: 9, stale: n % 2 === 0, heartbeatAt: iso(Date.now() - 25_000) },
          ],
        });
      },
    ],
    ["Pre-ping warning", () => socket.serverEmit("ping:pre_warning", { inMs: 10_000, haptic: [200, 100, 200] })],
    ["Boundary warning", () => socket.serverEmit("hider:boundary_warning", { graceMs: 15_000, haptic: [200, 100, 200] })],
    [
      "OOB penalty",
      () =>
        socket.serverEmit("hider:out_of_bounds", {
          playerId: role === "HIDER" ? "me" : "h2",
          since: iso(Date.now() - 16_000),
          location: { ...off(0.0025, 0.0002), accuracy_m: 7 },
        }),
    ],
    ["Back in bounds", () => socket.serverEmit("hider:back_in_bounds", { playerId: role === "HIDER" ? "me" : "h2" })],
    [
      "Expose seeker",
      () =>
        socket.serverEmit("seeker:exposed", {
          seekerPlayerId: role === "HIDER" ? "s1" : "me",
          location: { ...off(-0.0003, -0.0002), accuracy_m: 6 },
          until: iso(Date.now() + 30_000),
        }),
    ],
    [
      "Incoming tag request",
      () =>
        socket.serverEmit("tag_request:incoming", {
          requestId: crypto.randomUUID(),
          seekerPlayerId: "s1",
          seekerName: "Sam",
          expiresAt: iso(Date.now() + 15_000),
        }),
    ],
    ["Go ACTIVE", () => setStatus("ACTIVE")],
    [
      "End match",
      () => {
        const released = startedAt + 95_000;
        setPlayers((ps) =>
          ps.map((p) =>
            p.id === "h2"
              ? { ...p, caught_at: iso(released + 6 * 60_000), caught_by_player_id: "s2", catch_method: "PROXIMITY" }
              : p.role === "HIDER" && !p.caught_at
                ? { ...p, caught_at: iso(released + 8.5 * 60_000), caught_by_player_id: "s2", catch_method: "TAG_REQUEST" }
                : p.id === "s2"
                  ? { ...p, catches_count: 2 }
                  : p,
          ),
        );
        setStatus("ENDED");
      },
    ],
  ];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <MatchScreen
        room={room}
        me={players.find((p) => p.id === "me") ?? null}
        players={players}
        socket={socket as unknown as GameSocket}
        refresh={() => setPlayers((ps) => ps.map((p) => p))}
        loadPingHistory={async () => fakeHistory(startedAt + 95_000, players.filter((p) => p.role === "HIDER").map((p) => p.id))}
      />
      <CatchSync socket={socket} setPlayers={setPlayers} />
      <button
        type="button"
        onClick={() => setPanel((p) => !p)}
        className="fixed bottom-1/2 left-0 z-[80] rounded-r-lg bg-fuchsia-600 px-1.5 py-2 text-[10px] font-bold text-white"
      >
        QA
      </button>
      {panel ? (
        <div data-testid="qa-panel" className="fixed top-1/3 left-6 z-[80] flex w-40 flex-col gap-1 rounded-xl bg-fuchsia-950/95 p-2 text-[11px]">
          {sim.map(([label, fn]) => (
            <button key={label} type="button" onClick={fn} className="rounded bg-fuchsia-800 px-2 py-1 text-left text-white">
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Two hiders wandering across 8 ping waves (Dmitri's trail stops when caught at wave 6). */
function fakeHistory(releasedAt: number, hiderIds: string[]): PingSnapshotRow[] {
  const rows: PingSnapshotRow[] = [];
  for (let w = 1; w <= 8; w++) {
    const at = iso(releasedAt + w * 60_000);
    const paths: Record<string, [number, number]> = {
      h1: [0.0006 - w * 0.00012, -0.0009 + w * 0.0002],
      me: [-0.0004 + w * 0.0001, 0.0005 - w * 0.00008],
      h2: [-0.0009 + w * 0.0002, 0.001 - w * 0.00015],
    };
    const walkers = hiderIds
      .filter((id) => paths[id] && (id !== "h2" || w <= 6))
      .map((id) => [id, ...paths[id]!] as [string, number, number]);
    for (const [pid, dLat, dLng] of walkers) {
      rows.push({
        id: `${w}-${pid}`,
        room_id: "r1",
        wave_number: w,
        player_id: pid,
        ...off(dLat, dLng),
        accuracy_m: 8 + (w % 3) * 6,
        stale: w === 4 && pid === "h2",
        heartbeat_at: at,
        created_at: at,
      });
    }
  }
  return rows;
}

function rosterFor(r: PlayerRole): PlayerRow[] {
  return [
    mk("me", "You", r),
    mk(r === "HIDER" ? "s1" : "h1", r === "HIDER" ? "Sam" : "Bea", r === "HIDER" ? "SEEKER" : "HIDER"),
    mk("h2", "Dmitri", "HIDER"),
    mk("s2", "Cy", "SEEKER"),
  ];
}

function RolePicker({ onPick }: { onPick: (r: PlayerRole, st: RoomStatus) => void }) {
  return (
    <div className="m-auto flex flex-col gap-3">
      {(["HIDER", "SEEKER"] as const).map((r) =>
        (["HEAD_START", "ACTIVE"] as const).map((st) => (
          <button
            key={`${r}-${st}`}
            type="button"
            className="rounded-xl bg-white px-4 py-3 font-semibold text-black"
            onClick={() => onPick(r, st)}
          >
            {r} · {st}
          </button>
        )),
      )}
    </div>
  );
}

/** Mirrors server "hider:caught" into the fixture roster (stand-in for the Supabase refetch). */
function CatchSync({ socket, setPlayers }: { socket: FakeSocket; setPlayers: (f: (p: PlayerRow[]) => PlayerRow[]) => void }) {
  useMemo(() => {
    socket.on("hider:caught", (raw) => {
      const c = raw as { playerId: string; byPlayerId: string | null };
      setPlayers((ps) =>
        ps.map((p) => (p.id === c.playerId ? { ...p, caught_at: iso(Date.now()), caught_by_player_id: c.byPlayerId } : p)),
      );
    });
  }, [socket, setPlayers]);
  return null;
}
