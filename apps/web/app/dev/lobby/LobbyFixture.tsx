"use client";

import type { PlayerRole, PlayerRow, RoomRow } from "@hideseek/shared";
import { useState } from "react";
import { Lobby } from "@/components/lobby/Lobby";
import { bufferFence, circlePolygon } from "@/lib/geofence";

const CENTER: [number, number] = [-73.9654, 40.7829];
const fence = circlePolygon(CENTER, 200);
const now = new Date().toISOString();

const room: RoomRow = {
  id: "room-1",
  code: "HIDE42",
  host_user_id: "u-me",
  status: "LOBBY",
  max_players: 6,
  seeker_count: 2,
  game_duration_mins: 45,
  head_start_secs: 300,
  ping_interval_min_secs: 120,
  ping_interval_max_secs: 300,
  geofence: fence,
  geofence_buffered: bufferFence(fence)!,
  geofence_area_m2: Math.PI * 200 * 200,
  head_start_ends_at: null,
  started_at: null,
  ends_at: null,
  ended_at: null,
  winner: null,
  ping_wave_count: 0,
  created_at: now,
  updated_at: now,
};

const player = (id: string, name: string, role: PlayerRole, extra: Partial<PlayerRow> = {}): PlayerRow => ({
  id,
  room_id: room.id,
  user_id: `u-${id}`,
  display_name: name,
  role,
  is_host: false,
  is_ready: false,
  ready_checked_at: null,
  caught_at: null,
  caught_by_player_id: null,
  catch_method: null,
  catches_count: 0,
  last_failed_tag_at: null,
  exposed_until: null,
  out_of_bounds_since: null,
  last_seen_at: now,
  joined_at: now,
  ...extra,
});

const initial = [
  player("me", "You (host)", "UNASSIGNED", { is_host: true }),
  player("p2", "Bea", "HIDER", { is_ready: true }),
  player("p3", "Cy", "SEEKER", { is_ready: true }),
  player("p4", "Dmitri", "HIDER"),
  player("p5", "Eve", "UNASSIGNED"),
];

export function LobbyFixture() {
  const [players, setPlayers] = useState(initial);
  const [r, setRoom] = useState(room);
  // Mount on demand so QA can stub navigator.geolocation first.
  const [mounted, setMounted] = useState(false);
  const me = players.find((p) => p.id === "me") ?? null;
  const patchMe = (patch: Partial<PlayerRow>) =>
    setPlayers((ps) => ps.map((p) => (p.id === "me" ? { ...p, ...patch } : p)));

  if (!mounted) {
    return (
      <button type="button" className="m-auto rounded-xl bg-white px-4 py-3 text-black" onClick={() => setMounted(true)}>
        Mount lobby fixture
      </button>
    );
  }
  if (r.status !== "LOBBY") return <p data-testid="match-status" className="m-auto text-2xl font-black">{r.status}</p>;

  return (
    <Lobby
      room={r}
      players={players}
      me={me}
      connected
      claim={async (role) => {
        const cap = role === "SEEKER" ? r.seeker_count : r.max_players - r.seeker_count;
        if (role !== "UNASSIGNED" && players.filter((p) => p.role === role && p.id !== "me").length >= cap) {
          return "That side is full.";
        }
        patchMe({ role, is_ready: false });
        return null;
      }}
      setReady={async (ready) => {
        patchMe({ is_ready: ready, ready_checked_at: ready ? new Date().toISOString() : null });
        return null;
      }}
      start={async (force) => {
        if (force) {
          setPlayers((ps) => ps.map((p) => (p.role !== "UNASSIGNED" && !p.is_ready ? { ...p, role: "UNASSIGNED" } : p)));
        }
        setRoom({ ...r, status: "HEAD_START" });
        return null;
      }}
      leave={async () => "Leaving is disabled in the fixture."}
    />
  );
}
