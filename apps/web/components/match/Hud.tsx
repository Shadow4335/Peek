import { Radio, Timer } from "lucide-react";
import { formatClock } from "@/lib/useNow";

interface HudProps {
  label: string;
  tone: "hider" | "seeker" | "neutral";
  /** ms remaining on the main clock. */
  remainingMs: number;
  hidersLeft: number;
  hidersTotal: number;
  wave?: number;
  /** Final-10-minute indicator (computed from ends_at by the caller). */
  endgame?: boolean;
  /** Banners / toasts stacked under the HUD. */
  children?: React.ReactNode;
}

const TONE = {
  hider: "bg-hider text-black",
  seeker: "bg-seeker text-black",
  neutral: "bg-neutral-800 text-neutral-200",
};

export function Hud({ label, tone, remainingMs, hidersLeft, hidersTotal, wave, endgame = false, children }: HudProps) {
  return (
    <div className="pt-safe pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 px-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-black/85 p-2 ring-1 ring-neutral-800 backdrop-blur">
        <span className={`rounded-xl px-2.5 py-1 text-xs font-black uppercase tracking-wider ${TONE[tone]}`}>{label}</span>
        <span
          data-testid="hud-clock"
          className={`flex flex-1 items-center justify-center gap-1.5 font-mono text-2xl font-bold tabular-nums ${
            endgame ? "text-warn" : "text-white"
          }`}
        >
          <Timer className="size-4 opacity-60" aria-hidden />
          {formatClock(remainingMs)}
        </span>
        <span className="flex flex-col items-end text-[11px] leading-tight text-neutral-400">
          <span>
            <b className="text-hider">{hidersLeft}</b>/{hidersTotal} hiding
          </span>
          {wave !== undefined ? (
            <span className="flex items-center gap-1">
              <Radio className="size-3" aria-hidden /> wave {wave}
            </span>
          ) : null}
        </span>
      </div>
      {endgame ? (
        <p className="-mt-1 text-center text-[11px] font-semibold uppercase tracking-widest text-warn">
          Final 10 min — pings 25% faster
        </p>
      ) : null}
      {children}
    </div>
  );
}
