import { Radio, Users } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatClock } from "@/lib/useNow";

interface HudProps {
  label: string;
  tone: "hider" | "seeker" | "neutral";
  /** ms remaining on the main clock. */
  remainingMs: number;
  /** What the clock counts down to, for screen readers. */
  clockLabel?: string;
  hidersLeft: number;
  hidersTotal: number;
  wave?: number;
  /** Final-10-minute indicator (computed from ends_at by the caller). */
  endgame?: boolean;
  /** Banners / toasts stacked under the HUD. */
  children?: React.ReactNode;
}

const ROLE_TONE: Record<HudProps["tone"], BadgeTone> = { hider: "hider", seeker: "seeker", neutral: "neutral" };

/** Floating dark game panel: role chip, big tabular timer, hiders remaining. */
export function Hud({
  label,
  tone,
  remainingMs,
  clockLabel = "Time left",
  hidersLeft,
  hidersTotal,
  wave,
  endgame = false,
  children,
}: HudProps) {
  return (
    <div className="pt-safe pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 px-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-card bg-surface/95 px-3 py-2 shadow-panel ring-1 ring-line backdrop-blur">
        <div className="flex flex-col items-start gap-1">
          <Badge tone={ROLE_TONE[tone]}>{label}</Badge>
          <Badge tone="active" dot>
            In game
          </Badge>
        </div>
        <span
          data-testid="hud-clock"
          role="timer"
          aria-label={`${clockLabel}: ${formatClock(remainingMs)}`}
          className={`peek-timer flex-1 text-center text-[32px] leading-none font-semibold ${
            endgame ? "animate-caution text-reward" : "text-ink"
          }`}
        >
          {formatClock(remainingMs)}
        </span>
        <span className="flex flex-col items-end gap-1 text-xs leading-tight text-ink-2">
          <span className="flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            <b className="font-semibold text-ink">{hidersLeft}</b>/{hidersTotal} hiding
          </span>
          {wave !== undefined ? (
            <span className="flex items-center gap-1">
              <Radio className="size-3.5" aria-hidden /> ping {wave}
            </span>
          ) : null}
        </span>
      </div>
      {endgame ? (
        <p className="-mt-1 text-center text-xs font-semibold tracking-wide text-reward">Final 10 min — pings come faster</p>
      ) : null}
      {/* Banners/toasts leave a lane on the right for the map's locate / fit buttons. */}
      {children ? <div className="flex flex-col gap-2 pr-14">{children}</div> : null}
    </div>
  );
}
