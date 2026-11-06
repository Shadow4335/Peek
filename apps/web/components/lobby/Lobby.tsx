"use client";

import type { PlayerRole, PlayerRow, RoomRow } from "@hideseek/shared";
import { Check, Copy, LogOut, Play, Share2, Users, Wifi, WifiOff } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorNotice } from "@/components/ui/Notice";
import { formatDuration } from "@/components/ui/Slider";
import { formatArea } from "@/lib/geofence";
import { useGeolocation, type TimedFix } from "@/lib/useGeolocation";
import { useReadyGuard } from "@/lib/useReadyGuard";
import { assessZone } from "@/lib/zone";
import { GpsBadge } from "./GpsBadge";
import { RosterColumn } from "./RosterColumn";

const ZoneMiniMap = dynamic(() => import("./ZoneMiniMap"), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-3xl bg-neutral-950 ring-1 ring-neutral-800" />,
});

type ActionResult = Promise<string | null>;

interface LobbyProps {
  room: RoomRow;
  players: PlayerRow[];
  me: PlayerRow | null;
  connected: boolean;
  claim: (role: PlayerRole) => ActionResult;
  setReady: (ready: boolean, fix?: TimedFix | null) => ActionResult;
  start: (force: boolean) => ActionResult;
  leave: () => ActionResult;
}

export function Lobby({ room, players, me, connected, claim, setReady, start, leave }: LobbyProps) {
  const { fix, status } = useGeolocation(true);
  const zone = assessZone(fix, status, room.geofence_buffered);
  useReadyGuard(me, zone, fix, setReady);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmForce, setConfirmForce] = useState(false);

  const act = async (fn: () => ActionResult) => {
    setBusy(true);
    setError(null);
    setError(await fn());
    setBusy(false);
  };

  const roster = useMemo(() => {
    const by = (r: PlayerRole) => players.filter((p) => p.role === r);
    const hiders = by("HIDER");
    const seekers = by("SEEKER");
    const unassigned = by("UNASSIGNED");
    const readyHiders = hiders.filter((p) => p.is_ready).length;
    const readySeekers = seekers.filter((p) => p.is_ready).length;
    const unready = [...hiders, ...seekers].filter((p) => !p.is_ready).length;
    const blockingUnassigned = unassigned.filter((p) => !p.is_host).length;
    return {
      hiders,
      seekers,
      unassigned,
      readyHiders,
      readySeekers,
      unready,
      canStart: readyHiders >= 1 && readySeekers >= 1 && unready === 0 && blockingUnassigned === 0,
      canForce: readyHiders >= 1 && readySeekers >= 1,
      leftOut: unready + blockingUnassigned,
    };
  }, [players]);

  const isHost = Boolean(me?.is_host);
  const myRole = me?.role ?? null;

  const readyBlocker =
    !me || myRole === "UNASSIGNED"
      ? "Pick a side first"
      : zone === "inside"
        ? null
        : zone === "outside"
          ? "Move inside the play zone"
          : zone === "inaccurate"
            ? "Waiting for a sharper GPS fix"
            : zone === "locating"
              ? "Finding your location…"
              : "Location access is required";

  const share = async () => {
    const url = `${window.location.origin}/room/${room.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join my Hide & Seek game", text: `Room ${room.code}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* share sheet dismissed */
    }
  };

  const onLeave = async () => {
    if (!confirmLeave) {
      setConfirmLeave(true);
      setTimeout(() => setConfirmLeave(false), 3000);
      return;
    }
    await act(leave);
  };

  const onForce = async () => {
    if (!confirmForce) {
      setConfirmForce(true);
      setTimeout(() => setConfirmForce(false), 4000);
      return;
    }
    setConfirmForce(false);
    await act(() => start(true));
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
      <div className="pt-safe flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 [&>*]:shrink-0">
        {/* Header */}
        <header className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLeave}
            disabled={busy}
            aria-label="Leave room"
            className={`flex h-11 items-center gap-1.5 rounded-full px-3 text-sm ring-1 ${
              confirmLeave ? "bg-seeker text-black ring-seeker" : "bg-neutral-950 text-neutral-300 ring-neutral-800"
            }`}
          >
            <LogOut className="size-4" aria-hidden />
            {confirmLeave ? "Tap to leave" : null}
          </button>
          <button
            type="button"
            onClick={share}
            data-testid="room-code"
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-950 font-mono text-xl font-black tracking-[0.3em] text-hider ring-1 ring-neutral-800"
          >
            {room.code}
            {copied ? (
              <Check className="size-4 text-neutral-300" aria-label="Copied" />
            ) : typeof navigator !== "undefined" && "share" in navigator ? (
              <Share2 className="size-4 text-neutral-400" aria-label="Share" />
            ) : (
              <Copy className="size-4 text-neutral-400" aria-label="Copy link" />
            )}
          </button>
          <span className="flex h-11 items-center gap-1 rounded-full bg-neutral-950 px-3 text-sm text-neutral-300 ring-1 ring-neutral-800">
            <Users className="size-4" aria-hidden />
            {players.length}/{room.max_players}
          </span>
        </header>

        <p className="flex flex-wrap items-center gap-x-2 text-xs text-neutral-500">
          <span>{formatDuration(room.game_duration_mins * 60)} match</span>·
          <span>{formatDuration(room.head_start_secs)} head start</span>·
          <span>
            ping {formatDuration(room.ping_interval_min_secs)}–{formatDuration(room.ping_interval_max_secs)}
          </span>
          ·<span>{formatArea(room.geofence_area_m2)}</span>
          <span className="ml-auto flex items-center gap-1" title={connected ? "Game server connected" : "Game server offline"}>
            {connected ? <Wifi className="size-3.5 text-hider" /> : <WifiOff className="size-3.5 text-warn" />}
          </span>
        </p>

        <GpsBadge zone={zone} accuracy={fix?.accuracy_m ?? null} />
        <ZoneMiniMap fence={room.geofence} buffered={room.geofence_buffered} fix={fix} inside={zone === "inside"} />

        {/* Unassigned pool */}
        {roster.unassigned.length > 0 ? (
          <section
            aria-label="Unassigned"
            data-testid="column-UNASSIGNED"
            className="flex flex-col gap-2 rounded-3xl bg-neutral-950 p-3 ring-1 ring-neutral-800"
          >
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Unassigned · {roster.unassigned.length}
            </h2>
            <ul className="flex flex-wrap gap-1.5">
              {roster.unassigned.map((p) => (
                <li
                  key={p.id}
                  className={`rounded-full px-3 py-1 text-sm ${
                    p.id === me?.id ? "bg-white text-black" : "bg-neutral-900 text-neutral-300"
                  }`}
                >
                  {p.display_name}
                  {p.is_host ? " 👑" : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <RosterColumn
            role="HIDER"
            players={roster.hiders}
            capacity={room.max_players - room.seeker_count}
            meId={me?.id ?? null}
            myRole={myRole}
            busy={busy}
            onClaim={() => act(() => claim("HIDER"))}
          />
          <RosterColumn
            role="SEEKER"
            players={roster.seekers}
            capacity={room.seeker_count}
            meId={me?.id ?? null}
            myRole={myRole}
            busy={busy}
            onClaim={() => act(() => claim("SEEKER"))}
          />
        </div>

        {myRole && myRole !== "UNASSIGNED" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => claim("UNASSIGNED"))}
            className="self-center text-xs text-neutral-500 underline underline-offset-4"
          >
            Leave my side
          </button>
        ) : null}
      </div>

      {/* Action bar */}
      <footer className="pb-safe flex flex-col gap-2 border-t border-neutral-900 bg-black px-4 pt-3">
        <ErrorNotice>{error}</ErrorNotice>

        {me?.is_ready ? (
          <Button variant="secondary" block disabled={busy} onClick={() => act(() => setReady(false))}>
            <Check className="size-5 text-hider" aria-hidden /> Ready — tap to cancel
          </Button>
        ) : (
          <Button block disabled={busy || readyBlocker !== null} onClick={() => act(() => setReady(true, fix))}>
            {readyBlocker ?? "I'm ready"}
          </Button>
        )}

        {isHost ? (
          <div className="flex flex-col gap-2">
            <Button
              variant={roster.canStart ? "primary" : "secondary"}
              block
              disabled={busy || !roster.canStart}
              icon={<Play className="size-5" aria-hidden />}
              onClick={() => act(() => start(false))}
            >
              Start match
            </Button>
            {!roster.canStart && roster.canForce ? (
              <Button variant={confirmForce ? "danger" : "ghost"} block disabled={busy} onClick={onForce}>
                {confirmForce
                  ? `Confirm: ${roster.leftOut} not-ready player${roster.leftOut === 1 ? "" : "s"} will spectate`
                  : `Start with current roster (${roster.readyHiders}H · ${roster.readySeekers}S ready)`}
              </Button>
            ) : null}
            {!roster.canForce ? (
              <p className="text-center text-xs text-neutral-500">
                Need at least one ready Hider and one ready Seeker to start.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-center text-xs text-neutral-500">Waiting for the host to start…</p>
        )}
      </footer>
    </div>
  );
}
