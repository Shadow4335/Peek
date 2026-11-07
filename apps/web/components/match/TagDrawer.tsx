"use client";

import type { PingWaveEvent, PlayerRow } from "@hideseek/shared";
import { ChevronDown, ChevronUp, Hand, Info, Loader2, Lock, ScanEye } from "lucide-react";
import { useState } from "react";
import type { OutgoingRequest } from "@/lib/useMatch";
import { Badge } from "@/components/ui/Badge";
import { SheetGrabber } from "@/components/ui/Card";
import { FRESH_PING_MS, formatAgo } from "@/lib/useNow";
import { initialOf } from "@/components/map/markers";

interface Props {
  hiders: PlayerRow[];
  latestWave: PingWaveEvent | null;
  waves: PingWaveEvent[];
  cooldownUntil: number;
  eligible: Record<string, true>;
  outgoing: OutgoingRequest | null;
  hasFix: boolean;
  now: number;
  onTag: (hiderId: string) => Promise<void>;
  onRequest: (hiderId: string) => void;
}

/**
 * "Last pings" sheet: every uncaught hider with their snapshot state (fresh / aged /
 * waiting), capture time and GPS accuracy, plus "Tag [Hider]" (shared 20 s cooldown) and
 * the manual tag-request fallback. Doubles as the text equivalent of the map pins.
 */
export function TagDrawer({ hiders, waves, cooldownUntil, eligible, outgoing, hasFix, now, onTag, onRequest }: Props) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const lockedMs = cooldownUntil - now;
  const locked = lockedMs > 0;

  const lastPing = (id: string) => {
    for (const w of waves) {
      const p = w.pings.find((x) => x.playerId === id);
      if (p) return { at: Date.parse(w.firedAt), capturedAt: p.heartbeatAt, accuracy: p.accuracy_m, stale: p.stale };
    }
    return null;
  };

  const tag = async (id: string) => {
    setBusy(id);
    await onTag(id);
    setBusy(null);
  };

  return (
    <section
      data-testid="tag-drawer"
      aria-label="Last pings"
      className="pb-safe absolute inset-x-0 bottom-0 z-10 flex max-h-[50vh] flex-col rounded-t-panel bg-surface/95 px-4 pt-3 shadow-panel ring-1 ring-line backdrop-blur-md animate-sheet"
    >
      <SheetGrabber />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 items-center justify-between"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <ScanEye className="size-5 text-primary-text" aria-hidden />
          <h2 className="text-lg">Last pings</h2>
          <span className="text-sm text-ink-2">· {hiders.length} hiding</span>
        </span>
        <span className="flex items-center gap-2">
          {locked ? (
            <Badge tone="warning" icon={<Lock className="size-3" aria-hidden />}>
              <span data-testid="tag-cooldown" className="peek-timer">
                {Math.ceil(lockedMs / 1000)}s
              </span>
            </Badge>
          ) : null}
          {open ? <ChevronDown className="size-5" /> : <ChevronUp className="size-5" />}
        </span>
      </button>

      {open ? (
        <ul className="flex flex-col gap-2 overflow-y-auto pb-2">
          {hiders.length === 0 ? <li className="py-4 text-center text-sm text-ink-2">Everyone has been found!</li> : null}
          {hiders.map((h) => {
            const ping = lastPing(h.id);
            const pending = outgoing?.hiderId === h.id;
            const pingAge = ping ? now - ping.at : null;
            const canRequest = Boolean(eligible[h.id]) || !ping || (pingAge !== null && pingAge > 30_000) || ping?.stale;
            const capturedMs = ping ? now - Date.parse(ping.capturedAt) : null;
            const fresh = ping && !ping.stale && capturedMs !== null && capturedMs < FRESH_PING_MS;
            return (
              <li key={h.id} className="flex flex-col gap-2 rounded-button bg-surface-raised p-3 ring-1 ring-line">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
                      fresh ? "bg-accent text-on-accent" : ping ? "bg-hider-soft text-hider" : "bg-surface-hover text-ink-2"
                    }`}
                  >
                    {initialOf(h.display_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{h.display_name}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
                      {ping ? (
                        <>
                          <Badge tone={fresh ? "active" : "hider"}>{fresh ? "Fresh ping" : "Last seen"}</Badge>
                          <span className="tabular-nums">
                            {formatAgo(ping.capturedAt, now)} · ±{Math.round(ping.accuracy)} m
                          </span>
                        </>
                      ) : (
                        <Badge tone="neutral">Waiting for a ping</Badge>
                      )}
                      {ping?.stale ? <Badge tone="warning">Old GPS</Badge> : null}
                      {h.out_of_bounds_since ? <Badge tone="warning">Out of bounds</Badge> : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={locked || !hasFix || busy !== null}
                    onClick={() => void tag(h.id)}
                    className="flex min-h-12 min-w-24 items-center justify-center gap-1.5 rounded-button bg-accent px-3 text-sm font-semibold text-on-accent transition-transform duration-150 active:scale-[.97] disabled:bg-surface-hover disabled:text-ink-3"
                  >
                    {busy === h.id ? (
                      <Loader2 className="size-4 animate-spin" aria-label="Checking" />
                    ) : locked ? (
                      <>
                        <Lock className="size-4" aria-hidden /> {Math.ceil(lockedMs / 1000)}s
                      </>
                    ) : !hasFix ? (
                      "No GPS"
                    ) : (
                      `Tag ${h.display_name}`
                    )}
                  </button>
                </div>
                {pending ? (
                  <p role="status" className="flex items-center gap-1.5 text-xs text-ink">
                    <Loader2 className="size-3 animate-spin" aria-hidden /> Waiting for {h.display_name} to confirm…{" "}
                    {Math.max(0, Math.ceil((outgoing.expiresAt - now) / 1000))}s
                  </p>
                ) : canRequest ? (
                  <button
                    type="button"
                    disabled={outgoing !== null}
                    onClick={() => onRequest(h.id)}
                    className="flex min-h-9 items-center gap-1.5 self-start text-xs text-primary-text underline underline-offset-4 disabled:text-ink-3"
                  >
                    <Hand className="size-3.5" aria-hidden /> Standing right next to them? Send tag request
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {open ? (
        <p className="flex items-start gap-1.5 pb-1 text-xs text-ink-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Positions may have changed since the last ping. Dashed circles show GPS accuracy.
        </p>
      ) : null}
    </section>
  );
}
