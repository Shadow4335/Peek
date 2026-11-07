import { EyeOff } from "lucide-react";

/** Hider role reveal during the head start (the clock lives in the HUD). */
export function HeadStartBanner() {
  return (
    <section
      aria-label="Your role"
      className="pointer-events-auto flex animate-reveal items-center gap-3 rounded-card bg-surface/95 p-3 shadow-panel ring-1 ring-hider/40 backdrop-blur"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-hider-soft">
        <EyeOff className="size-5 text-hider" aria-hidden />
      </span>
      <span>
        <span className="block font-display text-lg leading-tight text-hider">Sneaky Hider</span>
        <span className="text-sm text-ink-2">Find your spot. Stay quiet. Seekers are locked out.</span>
      </span>
    </section>
  );
}
