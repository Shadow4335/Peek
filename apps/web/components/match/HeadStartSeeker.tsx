import { Lock } from "lucide-react";
import { formatArea } from "@/lib/geofence";
import { formatClock } from "@/lib/useNow";
import { msUntil, type MatchViewProps } from "./types";

/** Seekers are locked out of the map until the head start ends. */
export function HeadStartSeeker({ room, players, now }: MatchViewProps) {
  const left = msUntil(room.head_start_ends_at, now);
  const hiders = players.filter((p) => p.role === "HIDER").length;
  return (
    <div className="pt-safe pb-safe flex flex-1 flex-col items-center justify-center gap-6 bg-black px-6 text-center">
      <div className="grid size-20 place-items-center rounded-full bg-rose-950/60 ring-1 ring-rose-800">
        <Lock className="size-9 text-seeker" aria-hidden />
      </div>
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">Radar unlocks in</p>
        <p data-testid="headstart-clock" className="font-mono text-7xl font-black tabular-nums text-white">
          {formatClock(left)}
        </p>
      </div>
      <p className="max-w-xs text-neutral-400">
        {hiders} hider{hiders === 1 ? " is" : "s are"} hiding somewhere in the {formatArea(room.geofence_area_m2)} zone.
        Stay put and no peeking.
      </p>
    </div>
  );
}
