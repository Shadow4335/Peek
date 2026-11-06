import { READY_MAX_ACCURACY_M } from "@hideseek/shared";
import { CircleCheck, CircleX, Loader2, MapPinOff, Satellite } from "lucide-react";
import type { ZoneState } from "@/lib/zone";

const COPY: Record<ZoneState, { label: string; tone: string; Icon: typeof CircleCheck }> = {
  inside: { label: "Inside Play Zone", tone: "bg-lime-950/70 text-hider ring-lime-800", Icon: CircleCheck },
  outside: { label: "Outside Boundary", tone: "bg-rose-950/70 text-seeker ring-rose-800", Icon: CircleX },
  inaccurate: { label: "GPS too imprecise", tone: "bg-amber-950/70 text-warn ring-amber-800", Icon: Satellite },
  locating: { label: "Finding your location…", tone: "bg-neutral-900 text-neutral-300 ring-neutral-700", Icon: Loader2 },
  denied: { label: "Location blocked", tone: "bg-rose-950/70 text-seeker ring-rose-800", Icon: MapPinOff },
  unavailable: { label: "No GPS on this device", tone: "bg-rose-950/70 text-seeker ring-rose-800", Icon: MapPinOff },
};

export function GpsBadge({ zone, accuracy }: { zone: ZoneState; accuracy: number | null }) {
  const { label, tone, Icon } = COPY[zone];
  return (
    <div
      role="status"
      data-testid="gps-badge"
      data-zone={zone}
      className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1 ring-inset ${tone}`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Icon className={`size-5 ${zone === "locating" ? "animate-spin" : ""}`} aria-hidden />
        {label}
      </span>
      {accuracy !== null ? (
        <span className="font-mono text-xs opacity-80">
          ±{Math.round(accuracy)} m{zone === "inaccurate" ? ` (need ≤ ${READY_MAX_ACCURACY_M})` : ""}
        </span>
      ) : null}
      {zone === "denied" ? <span className="text-xs opacity-80">Enable it in browser settings</span> : null}
    </div>
  );
}
