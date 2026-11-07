import { Lock, ScanEye } from "lucide-react";
import { formatArea } from "@/lib/geofence";
import { formatClock } from "@/lib/useNow";
import { msUntil, type MatchViewProps } from "./types";

/** Role reveal for seekers: locked out of the map until the head start ends. */
export function HeadStartSeeker({ room, players, now }: MatchViewProps) {
  const left = msUntil(room.head_start_ends_at, now);
  const hiders = players.filter((p) => p.role === "HIDER").length;
  return (
    <div className="pt-safe pb-safe flex flex-1 flex-col items-center justify-center gap-6 bg-[radial-gradient(ellipse_at_top,#252330,#14151b_60%)] px-6 text-center">
      <section className="flex w-full max-w-sm animate-reveal flex-col items-center gap-4 rounded-panel bg-surface p-6 ring-1 ring-line">
        <div className="grid size-16 place-items-center rounded-full bg-seeker-soft ring-1 ring-seeker/40">
          <ScanEye className="size-8 text-seeker-text" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-seeker-text uppercase">Your role</p>
          <h1 className="text-[34px] leading-tight">Super Seeker</h1>
          <p className="text-ink-2">Time to find your friends.</p>
        </div>
        <div className="w-full rounded-button bg-surface-raised p-4">
          <p className="flex items-center justify-center gap-1.5 text-sm text-ink-2">
            <Lock className="size-4" aria-hidden /> Map unlocks in
          </p>
          <p data-testid="headstart-clock" role="timer" className="peek-timer text-6xl font-semibold text-ink">
            {formatClock(left)}
          </p>
        </div>
        <p className="text-sm text-ink-2">
          {hiders} hider{hiders === 1 ? " is" : "s are"} hiding somewhere in the {formatArea(room.geofence_area_m2)}{" "}
          zone. Stay put — no peeking!
        </p>
      </section>
    </div>
  );
}
