import type { Toast } from "@/lib/useMatch";

const TONE: Record<Toast["tone"], string> = {
  info: "bg-neutral-900 text-neutral-100 ring-neutral-700",
  good: "bg-lime-950 text-hider ring-lime-800",
  bad: "bg-rose-950 text-seeker ring-rose-800",
  warn: "bg-amber-950 text-warn ring-amber-800",
};

/** Rendered inside the HUD column so it stacks under banners instead of overlapping them. */
export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div aria-live="polite" className="pointer-events-none flex flex-col items-center gap-1.5">
      {toasts.map((t) => (
        <div key={t.id} className={`rounded-full px-4 py-2 text-sm font-semibold shadow-lg ring-1 ${TONE[t.tone]}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
