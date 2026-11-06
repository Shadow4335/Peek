"use client";

import type { PingSnapshotRow, PingWaveEvent, PlayerRow, RoomRow } from "@hideseek/shared";
import { Crown, Pause, Play, RotateCcw, Trophy } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { buildResults, groupWaves } from "@/lib/summary";
import { getSupabase } from "@/lib/supabase";
import { formatClock } from "@/lib/useNow";

const ReplayMap = dynamic(() => import("./ReplayMap"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-3xl bg-neutral-950 ring-1 ring-neutral-800" />,
});

export type PingHistoryLoader = (roomId: string) => Promise<PingSnapshotRow[]>;

const loadFromSupabase: PingHistoryLoader = async (roomId) => {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await getSupabase()
    .from("ping_snapshots")
    .select("*")
    .eq("room_id", roomId)
    .order("wave_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PingSnapshotRow[];
};

const METHOD: Record<string, string> = {
  PROXIMITY: "tagged",
  TAG_REQUEST: "confirmed tag",
  SELF_SURRENDER: "surrendered",
};

const STEP_MS = 900;

interface Props {
  room: RoomRow;
  players: PlayerRow[];
  me: PlayerRow | null;
  loadPingHistory?: PingHistoryLoader;
}

export function MatchSummary({ room, players, me, loadPingHistory = loadFromSupabase }: Props) {
  const { hiders, seekers, matchMs } = useMemo(() => buildResults(room, players), [room, players]);
  const [waves, setWaves] = useState<PingWaveEvent[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPingHistory(room.id)
      .then((rows) => {
        if (cancelled) return;
        const ws = groupWaves(rows, room.id);
        setWaves(ws);
        setStep(Math.max(0, ws.length - 1));
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [room.id, loadPingHistory]);

  // Auto-advance while playing; stop at the last wave.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setStep((s) => {
        if (s >= waves.length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, STEP_MS);
    return () => clearInterval(t);
  }, [playing, waves.length]);

  const colors = useMemo(() => new Map(hiders.map((h) => [h.player.id, h.color])), [hiders]);
  const names = useMemo(() => new Map(players.map((p) => [p.id, p.display_name])), [players]);
  const colorOf = useCallback((id: string) => colors.get(id) ?? "#a3a3a3", [colors]);
  const nameOf = useCallback((id: string) => names.get(id) ?? "Hider", [names]);

  const seekersWon = room.winner === "SEEKERS";
  const iWon =
    me && room.winner ? (seekersWon ? me.role === "SEEKER" : me.role === "HIDER") : null;
  const releasedAt = Date.parse(room.head_start_ends_at ?? room.started_at ?? room.created_at);
  const wave = waves[step];

  const togglePlay = () => {
    if (!playing && step >= waves.length - 1) setStep(0);
    setPlaying((p) => !p);
  };

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-4 overflow-y-auto px-4 [&>*]:shrink-0">
      {/* Winner banner */}
      <header
        className={`mt-2 flex flex-col items-center gap-1 rounded-3xl px-4 py-6 text-center ring-1 ${
          seekersWon ? "bg-rose-950/50 ring-rose-800" : room.winner ? "bg-lime-950/50 ring-lime-800" : "bg-neutral-950 ring-neutral-800"
        }`}
      >
        <Trophy className={`size-10 ${seekersWon ? "text-seeker" : "text-hider"}`} aria-hidden />
        <h1 data-testid="winner" className={`text-4xl font-black ${seekersWon ? "text-seeker" : "text-hider"}`}>
          {seekersWon ? "Seekers win" : room.winner === "HIDERS" ? "Hiders win" : "Match ended"}
        </h1>
        <p className="text-sm text-neutral-400">
          {formatClock(matchMs)} after release · {hiders.filter((h) => !h.survived).length}/{hiders.length} hiders caught
        </p>
        {iWon !== null ? (
          <p className={`mt-1 text-sm font-semibold ${iWon ? "text-white" : "text-neutral-500"}`}>
            {iWon ? "You won!" : "Better luck next time."}
          </p>
        ) : null}
      </header>

      {/* Replay */}
      <section className="flex flex-col gap-2" aria-label="Ping replay">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Ping replay</h2>
        <ReplayMap
          fence={room.geofence}
          buffered={room.geofence_buffered}
          waves={waves}
          step={step}
          colorOf={colorOf}
          nameOf={nameOf}
        />
        {waves.length > 0 ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause replay" : "Play replay"}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-black"
            >
              {playing ? <Pause className="size-5" /> : step >= waves.length - 1 ? <RotateCcw className="size-5" /> : <Play className="size-5" />}
            </button>
            <input
              type="range"
              aria-label="Replay wave"
              min={0}
              max={waves.length - 1}
              value={step}
              onChange={(e) => {
                setPlaying(false);
                setStep(Number(e.target.value));
              }}
              className="flex-1"
            />
            <span data-testid="replay-wave" className="w-24 text-right font-mono text-xs text-neutral-400 tabular-nums">
              wave {wave?.waveNumber ?? "-"} · {wave ? formatClock(Date.parse(wave.firedAt) - releasedAt) : "--"}
            </span>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">{loadError ? "Couldn't load ping history." : "No pings were fired."}</p>
        )}
      </section>

      {/* Hider leaderboard */}
      <section className="flex flex-col gap-2" aria-label="Hider survival">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Hider survival</h2>
        <ol className="flex flex-col gap-1.5" data-testid="hider-board">
          {hiders.map((h, i) => (
            <li
              key={h.player.id}
              className={`flex items-center gap-3 rounded-2xl bg-neutral-950 px-3 py-2.5 ring-1 ${
                h.player.id === me?.id ? "ring-white/40" : "ring-neutral-800"
              }`}
            >
              <span className="w-5 text-center font-mono text-sm text-neutral-500">{i + 1}</span>
              <span className="size-3 shrink-0 rounded-full" style={{ background: h.color }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{h.player.display_name}</span>
                <span className="block text-xs text-neutral-500">
                  {h.survived
                    ? "Survived"
                    : `${METHOD[h.player.catch_method ?? "PROXIMITY"]}${h.caughtBy ? ` · ${h.caughtBy}` : ""}`}
                </span>
              </span>
              <span className={`font-mono text-sm tabular-nums ${h.survived ? "text-hider" : "text-neutral-300"}`}>
                {formatClock(h.survivedMs)}
              </span>
              {h.survived ? <Crown className="size-4 text-warn" aria-label="Survivor" /> : null}
            </li>
          ))}
        </ol>
      </section>

      {/* Seeker catches */}
      <section className="flex flex-col gap-2" aria-label="Seeker catches">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Seeker catches</h2>
        <ol className="flex flex-col gap-1.5" data-testid="seeker-board">
          {seekers.map((s) => (
            <li
              key={s.player.id}
              className={`flex items-center gap-3 rounded-2xl bg-neutral-950 px-3 py-2.5 ring-1 ${
                s.player.id === me?.id ? "ring-white/40" : "ring-neutral-800"
              }`}
            >
              <span className="min-w-0 flex-1 truncate font-semibold">{s.player.display_name}</span>
              <span className="font-mono text-sm text-seeker tabular-nums">
                {s.catches} catch{s.catches === 1 ? "" : "es"}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <Link
        href="/"
        className="mb-4 flex min-h-12 items-center justify-center rounded-2xl bg-hider text-base font-semibold text-black"
      >
        Play again
      </Link>
    </div>
  );
}
