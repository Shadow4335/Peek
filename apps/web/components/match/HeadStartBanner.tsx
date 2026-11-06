import { Footprints } from "lucide-react";

/** Clock lives in the HUD; this just tells the hider what to do. */
export function HeadStartBanner() {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-lime-950/90 px-4 py-3 text-sm font-semibold text-hider ring-1 ring-lime-800 backdrop-blur">
      <Footprints className="size-5" aria-hidden /> Head start — go hide! Seekers are locked out.
    </div>
  );
}
