import type { ReactNode } from "react";

export type BadgeTone = "waiting" | "active" | "hider" | "seeker" | "warning" | "danger" | "neutral";

const TONES: Record<BadgeTone, string> = {
  waiting: "bg-primary-soft text-primary-text",
  active: "bg-accent-soft text-accent",
  hider: "bg-hider-soft text-hider",
  seeker: "bg-seeker-soft text-seeker-text",
  warning: "bg-reward-soft text-reward",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-raised text-ink-2",
};

/** Pill chip. Always carries a text label — status is never conveyed by hue alone. */
export function Badge({
  tone = "neutral",
  dot = false,
  icon,
  children,
  className = "",
}: {
  tone?: BadgeTone;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-tight font-semibold ${TONES[tone]} ${className}`}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {icon}
      {children}
    </span>
  );
}
