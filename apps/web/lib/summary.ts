import type { PingSnapshotRow, PingWaveEvent, PlayerRow, RoomRow } from "@hideseek/shared";

export const TRAIL_COLORS = ["#a3e635", "#38bdf8", "#f472b6", "#facc15", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171"];

export interface HiderResult {
  player: PlayerRow;
  survivedMs: number;
  survived: boolean;
  caughtBy: string | null;
  color: string;
}

export interface SeekerResult {
  player: PlayerRow;
  catches: number;
}

/**
 * Survival is measured from seeker release (head_start_ends_at) to the catch, or to
 * the end of the match for survivors.
 */
export function buildResults(room: RoomRow, players: PlayerRow[]) {
  const releasedAt = Date.parse(room.head_start_ends_at ?? room.started_at ?? room.created_at);
  const endedAt = Date.parse(room.ended_at ?? room.ends_at ?? new Date(releasedAt).toISOString());
  const names = new Map(players.map((p) => [p.id, p.display_name]));

  const hiderRows = players.filter((p) => p.role === "HIDER");
  const hiders: HiderResult[] = hiderRows
    .map((p, i) => {
      const end = p.caught_at ? Date.parse(p.caught_at) : endedAt;
      return {
        player: p,
        survivedMs: Math.max(0, end - releasedAt),
        survived: !p.caught_at,
        caughtBy: p.caught_by_player_id ? (names.get(p.caught_by_player_id) ?? "a seeker") : null,
        color: TRAIL_COLORS[i % TRAIL_COLORS.length]!,
      };
    })
    .sort((a, b) => Number(b.survived) - Number(a.survived) || b.survivedMs - a.survivedMs);

  const seekers: SeekerResult[] = players
    .filter((p) => p.role === "SEEKER")
    .map((p) => ({ player: p, catches: p.catches_count }))
    .sort((a, b) => b.catches - a.catches);

  return { hiders, seekers, matchMs: Math.max(0, endedAt - releasedAt) };
}

/** Groups snapshot rows into waves, oldest first. */
export function groupWaves(rows: PingSnapshotRow[], roomId: string): PingWaveEvent[] {
  const byWave = new Map<number, PingWaveEvent>();
  for (const r of rows) {
    const w = byWave.get(r.wave_number) ?? { roomId, waveNumber: r.wave_number, firedAt: r.created_at, pings: [] };
    w.pings.push({
      playerId: r.player_id,
      lat: r.lat,
      lng: r.lng,
      accuracy_m: r.accuracy_m,
      stale: r.stale,
      heartbeatAt: r.heartbeat_at,
    });
    byWave.set(r.wave_number, w);
  }
  return [...byWave.values()].sort((a, b) => a.waveNumber - b.waveNumber);
}
