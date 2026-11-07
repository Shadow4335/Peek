"use client";

import type { PlayerRow, RoomRow } from "@hideseek/shared";
import { useCallback, useMemo } from "react";
import type { GameSocket } from "@/lib/socket";
import { useGeolocation } from "@/lib/useGeolocation";
import { useHiderTelemetry, useSeekerBeacon } from "@/lib/useHiderTelemetry";
import { useMatch } from "@/lib/useMatch";
import { useNow } from "@/lib/useNow";
import { useWakeLock } from "@/lib/useWakeLock";
import { MatchSummary, type PingHistoryLoader } from "@/components/summary/MatchSummary";
import { HeadStartSeeker } from "./HeadStartSeeker";
import { HiderView } from "./HiderView";
import { SeekerView } from "./SeekerView";

interface Props {
  room: RoomRow;
  me: PlayerRow | null;
  players: PlayerRow[];
  socket: GameSocket | null;
  refresh: () => void;
  /** Override for tests/fixtures; defaults to Supabase ping_snapshots. */
  loadPingHistory?: PingHistoryLoader;
  onRematch?: () => Promise<{ code: string } | { error: string }>;
}

/** Routes HEAD_START / ACTIVE / ENDED to the right view for this player's role. */
export function MatchScreen({ room, me, players, socket, refresh, loadPingHistory, onRematch }: Props) {
  const live = room.status === "HEAD_START" || room.status === "ACTIVE";
  const isHider = me?.role === "HIDER" && !me.caught_at;
  const isSeeker = me?.role === "SEEKER";

  const { fix } = useGeolocation(live);
  const now = useNow(live ? 500 : 5000);
  const names = useMemo(() => new Map(players.map((p) => [p.id, p.display_name])), [players]);
  const nameOf = useCallback((id: string) => names.get(id), [names]);
  const match = useMatch(socket, room, me, refresh, { nameOf, announcePings: !isHider });
  const { held } = useWakeLock(live);
  useHiderTelemetry(socket, live && isHider, fix);
  useSeekerBeacon(socket, room.status === "ACTIVE" && isSeeker, fix);

  if (room.status === "ENDED" || !me) {
    return <MatchSummary room={room} players={players} me={me} loadPingHistory={loadPingHistory} onRematch={me ? onRematch : undefined} />;
  }

  const props = { room, me, players, match, fix, now, wakeLockHeld: held };
  if (isSeeker) return room.status === "HEAD_START" ? <HeadStartSeeker {...props} /> : <SeekerView {...props} />;
  if (isHider) return <HiderView {...props} />;
  return <SeekerView {...props} spectator />;
}
