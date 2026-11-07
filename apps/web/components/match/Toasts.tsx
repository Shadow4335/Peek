import type { Toast } from "@/lib/useMatch";

const TONE: Record<Toast["tone"], string> = {
  info: "bg-surface-raised text-ink ring-line",
  good: "bg-accent-soft text-accent ring-accent/35",
  bad: "bg-danger-soft text-danger ring-danger/40",
  warn: "bg-reward-soft text-reward ring-reward/40",
};

/** Rendered inside the HUD column so it stacks under banners instead of overlapping them. */
export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div aria-live="polite" className="pointer-events-none flex flex-col items-center gap-1.5">
      {toasts.map((t) => (
        <div key={t.id} className={`animate-enter rounded-full px-4 py-2 text-sm font-semibold shadow-panel ring-1 ${TONE[t.tone]}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
