import { ENDGAME_WINDOW_MS, type PlayerRow, type RoomRow } from "@hideseek/shared";
import type { TimedFix } from "@/lib/useGeolocation";
import type { useMatch } from "@/lib/useMatch";

export interface MatchViewProps {
  room: RoomRow;
  me: PlayerRow;
  players: PlayerRow[];
  match: ReturnType<typeof useMatch>;
  fix: TimedFix | null;
  now: number;
  wakeLockHeld: boolean;
}

/** The latest ping wave while it is still on screen (PING_VISIBLE_MS after arrival), else null. */
export const visibleWave = (match: MatchViewProps["match"], now: number) => {
  const latest = match.waves[0];
  return latest && match.pingVisibleUntil !== null && now < match.pingVisibleUntil ? latest : null;
};

export const msUntil = (iso: string | null, now: number) => (iso ? Date.parse(iso) - now : 0);

/** True during the final 10 minutes of an ACTIVE match (pings 0.75×). */
export const isEndgame = (room: RoomRow, now: number) => {
  const left = msUntil(room.ends_at, now);
  return room.status === "ACTIVE" && left > 0 && left <= ENDGAME_WINDOW_MS;
};
