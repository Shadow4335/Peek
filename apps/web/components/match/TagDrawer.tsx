"use client";

import type { PingWaveEvent, PlayerRow } from "@hideseek/shared";
import { ChevronDown, ChevronUp, Crosshair, Hand, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import type { OutgoingRequest } from "@/lib/useMatch";
import { formatClock } from "@/lib/useNow";

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

/** Bottom drawer: one "Tag [Hider]" button per uncaught hider, shared 20 s cooldown. */
export function TagDrawer({ hiders, waves, cooldownUntil, eligible, outgoing, hasFix, now, onTag, onRequest }: Props) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const lockedMs = cooldownUntil - now;
  const locked = lockedMs > 0;

  const lastPing = (id: string) => {
    for (const w of waves) {
      const p = w.pings.find((x) => x.playerId === id);
      if (p) return { at: Date.parse(w.firedAt), stale: p.stale };
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
      className="pb-safe absolute inset-x-0 bottom-0 z-10 flex max-h-[48vh] flex-col rounded-t-3xl bg-black/90 px-4 pt-2 ring-1 ring-neutral-800 backdrop-blur"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 items-center justify-between text-sm font-bold"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Crosshair className="size-4 text-seeker" aria-hidden /> Tag a hider ({hiders.length})
        </span>
        <span className="flex items-center gap-2">
          {locked ? (
            <span data-testid="tag-cooldown" className="flex items-center gap-1 rounded-full bg-amber-950 px-2 py-0.5 font-mono text-xs text-warn">
              <Lock className="size-3" aria-hidden /> {Math.ceil(lockedMs / 1000)}s
            </span>
          ) : null}
          {open ? <ChevronDown className="size-5" /> : <ChevronUp className="size-5" />}
        </span>
      </button>

      {open ? (
        <ul className="flex flex-col gap-2 overflow-y-auto pb-3">
          {hiders.length === 0 ? <li className="py-4 text-center text-sm text-neutral-500">Everyone is caught.</li> : null}
          {hiders.map((h) => {
            const ping = lastPing(h.id);
            const pending = outgoing?.hiderId === h.id;
            const pingAge = ping ? now - ping.at : null;
            const canRequest = Boolean(eligible[h.id]) || !ping || (pingAge !== null && pingAge > 30_000) || ping?.stale;
            return (
              <li key={h.id} className="flex flex-col gap-1.5 rounded-2xl bg-neutral-950 p-2.5 ring-1 ring-neutral-800">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{h.display_name}</p>
                    <p className="text-xs text-neutral-500">
                      {ping ? `pinged ${formatClock(pingAge ?? 0)} ago` : "no ping yet"}
                      {ping?.stale ? <span className="text-warn"> · stale GPS</span> : null}
                      {h.out_of_bounds_since ? <span className="text-warn"> · out of bounds</span> : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={locked || !hasFix || busy !== null}
                    onClick={() => void tag(h.id)}
                    className="flex min-h-11 min-w-28 items-center justify-center gap-1.5 rounded-xl bg-seeker px-3 text-sm font-bold text-black disabled:bg-neutral-800 disabled:text-neutral-500"
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
                  <p className="flex items-center gap-1.5 text-xs text-neutral-300">
                    <Loader2 className="size-3 animate-spin" aria-hidden /> Waiting for {h.display_name} to confirm…{" "}
                    {Math.max(0, Math.ceil((outgoing.expiresAt - now) / 1000))}s
                  </p>
                ) : canRequest ? (
                  <button
                    type="button"
                    disabled={outgoing !== null}
                    onClick={() => onRequest(h.id)}
                    className="flex items-center gap-1.5 self-start text-xs text-neutral-300 underline underline-offset-4 disabled:text-neutral-600"
                  >
                    <Hand className="size-3.5" aria-hidden /> Standing right next to them? Send tag request
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
