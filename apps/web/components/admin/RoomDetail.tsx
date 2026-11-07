"use client";

import type { AdminRoomDetail, MatchWinner, PlayerRow } from "@hideseek/shared";
import { Battery, Crown, Eye, ShieldAlert, UserMinus, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { COLORS } from "@/components/map/layers";
import { ErrorNotice } from "@/components/ui/Notice";
import { adminApi, adminErrorText } from "@/lib/admin";
import { formatArea } from "@/lib/geofence";
import { formatClock } from "@/lib/useNow";
import type { AdminMapPoint } from "./AdminMap";

const AdminMap = dynamic(() => import("./AdminMap"), {
  ssr: false,
  loading: () => <div className="h-full min-h-80 animate-pulse rounded-3xl bg-neutral-950 ring-1 ring-neutral-800" />,
});

const ROLE_TONE = {
  HIDER: "bg-lime-900 text-hider",
  SEEKER: "bg-rose-900 text-seeker",
  UNASSIGNED: "bg-neutral-800 text-neutral-300",
} as const;

const ago = (iso: string | null | undefined, now: number) => (iso ? formatClock(now - Date.parse(iso)) : "—");

export function RoomDetail({ detail, now, onChanged }: { detail: AdminRoomDetail; now: number; onChanged: () => void }) {
  const { room, players } = detail;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState<MatchWinner | "ABORT" | null>(null);

  const posOf = useMemo(() => new Map(detail.positions.map((p) => [p.playerId, p])), [detail.positions]);
  const oob = useMemo(() => new Set(detail.outOfBoundsHiders), [detail.outOfBoundsHiders]);
  const exposed = useMemo(() => new Set(detail.exposedSeekers.map((e) => e.seekerPlayerId)), [detail.exposedSeekers]);

  const points: AdminMapPoint[] = useMemo(
    () =>
      players.flatMap((p) => {
        const pos = posOf.get(p.id);
        if (!pos || p.caught_at) return [];
        const isHider = p.role === "HIDER";
        return [
          {
            id: p.id,
            label: `${p.display_name} · ${ago(pos.at, now)}`,
            lat: pos.lat,
            lng: pos.lng,
            accuracy_m: pos.accuracy_m,
            color: isHider ? COLORS.hider : p.role === "SEEKER" ? COLORS.seeker : "#a3a3a3",
            ring: oob.has(p.id) || exposed.has(p.id) ? COLORS.warn : undefined,
          },
        ];
      }),
    [players, posOf, oob, exposed, now],
  );

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(adminErrorText(err));
    } finally {
      setBusy(false);
      setConfirmEnd(null);
    }
  };

  const clock =
    room.status === "HEAD_START"
      ? `Head start ${formatClock(Date.parse(room.head_start_ends_at ?? "") - now)}`
      : room.status === "ACTIVE"
        ? `${formatClock(Date.parse(room.ends_at ?? "") - now)} left`
        : room.status === "ENDED"
          ? room.winner
            ? `${room.winner === "SEEKERS" ? "Seekers" : "Hiders"} won`
            : "Aborted"
          : "In lobby";

  const sorted = [...players].sort(
    (a, b) => ["SEEKER", "HIDER", "UNASSIGNED"].indexOf(a.role) - ["SEEKER", "HIDER", "UNASSIGNED"].indexOf(b.role),
  );

  return (
    <section className="flex min-h-0 flex-col gap-4" aria-label={`Room ${room.code}`}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="font-mono text-3xl font-black tracking-[0.25em] text-hider">{room.code}</h2>
        <span className="rounded-lg bg-neutral-800 px-2.5 py-1 text-sm font-bold">{room.status.replace("_", " ")}</span>
        <span data-testid="admin-clock" className="font-mono text-xl font-bold tabular-nums">
          {clock}
        </span>
        {detail.nextPingAt ? (
          <span className="rounded-lg bg-amber-950 px-2.5 py-1 font-mono text-sm text-warn" data-testid="next-ping">
            next ping {formatClock(Date.parse(detail.nextPingAt) - now)}
          </span>
        ) : null}
        <span className="text-sm text-neutral-500">
          wave {room.ping_wave_count} · {formatArea(room.geofence_area_m2)} · {room.game_duration_mins}m match
        </span>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_330px] xl:grid-cols-[1fr_380px]">
        <div className="min-h-[45vh] lg:min-h-0">
          <AdminMap detail={detail} points={points} />
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto" data-testid="admin-roster">
            {sorted.map((p: PlayerRow) => {
              const pos = posOf.get(p.id);
              const canKick = room.status === "LOBBY" && !p.is_host;
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-neutral-950 p-3 ring-1 ring-neutral-800">
                  <span className={`rounded-lg px-2 py-0.5 text-[11px] font-black ${ROLE_TONE[p.role]}`}>{p.role[0]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold">
                      {p.display_name}
                      {p.is_host ? <Crown className="size-3.5 text-warn" aria-label="Host" /> : null}
                      {oob.has(p.id) ? <ShieldAlert className="size-4 text-warn" aria-label="Out of bounds" /> : null}
                      {exposed.has(p.id) ? <Eye className="size-4 text-warn" aria-label="Exposed" /> : null}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {p.caught_at
                        ? `caught ${p.catch_method?.toLowerCase().replace("_", " ") ?? ""}`
                        : room.status === "LOBBY"
                          ? p.is_ready
                            ? "ready"
                            : "not ready"
                          : pos
                            ? `fix ${ago(pos.at, now)} ago · ±${Math.round(pos.accuracy_m)} m`
                            : "no fix"}
                      {p.role === "SEEKER" ? ` · ${p.catches_count} catches` : ""}
                    </p>
                  </div>
                  {pos?.battery != null ? (
                    <span className="flex items-center gap-1 text-xs text-neutral-400">
                      <Battery className="size-4" aria-hidden /> {Math.round(pos.battery * 100)}%
                    </span>
                  ) : null}
                  {canKick ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => adminApi.kick(room.id, p.id))}
                      aria-label={`Remove ${p.display_name}`}
                      className="grid size-11 place-items-center rounded-xl bg-neutral-900 text-seeker ring-1 ring-neutral-700"
                    >
                      <UserMinus className="size-5" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <ErrorNotice>{error}</ErrorNotice>

          {room.status !== "ENDED" ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-neutral-950 p-3 ring-1 ring-neutral-800">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">End match</p>
              {confirmEnd ? (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => adminApi.end(room.id, confirmEnd === "ABORT" ? null : confirmEnd))}
                    className="min-h-12 rounded-xl bg-seeker font-bold text-black"
                  >
                    Confirm:{" "}
                    {confirmEnd === "ABORT" ? "abort (no winner)" : `${confirmEnd === "HIDERS" ? "Hiders" : "Seekers"} win`}
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel"
                    onClick={() => setConfirmEnd(null)}
                    className="grid size-12 place-items-center rounded-xl bg-neutral-800"
                  >
                    <X className="size-5" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-sm font-semibold">
                  <button type="button" onClick={() => setConfirmEnd("HIDERS")} className="min-h-12 rounded-xl bg-lime-950 text-hider ring-1 ring-lime-800">
                    Hiders win
                  </button>
                  <button type="button" onClick={() => setConfirmEnd("SEEKERS")} className="min-h-12 rounded-xl bg-rose-950 text-seeker ring-1 ring-rose-800">
                    Seekers win
                  </button>
                  <button type="button" onClick={() => setConfirmEnd("ABORT")} className="min-h-12 rounded-xl bg-neutral-900 text-neutral-200 ring-1 ring-neutral-700">
                    Abort
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
