import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "selected";

/** Shared motion: 0.97 press over 160 ms, ≤2 px hover lift on pointer devices only. */
const BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-button px-5 text-[15px] font-semibold leading-tight " +
  "transition-[transform,background-color,filter,color] duration-150 ease-smooth active:scale-[.97] " +
  "[@media(hover:hover)]:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:active:scale-100 " +
  "disabled:hover:translate-y-0";

const VARIANTS: Record<Variant, string> = {
  // Sage CTA with dark label (Create, Start, Ready, Confirm)
  primary: "bg-accent text-on-accent hover:brightness-105 disabled:bg-surface-raised disabled:text-ink-3",
  secondary: "bg-surface-raised text-ink ring-1 ring-inset ring-line hover:bg-surface-hover disabled:text-ink-3",
  ghost: "bg-transparent text-ink-2 hover:bg-surface-raised disabled:text-ink-3",
  // Reserved for genuinely destructive / stop actions
  danger: "bg-danger text-on-primary hover:brightness-105 disabled:bg-surface-raised disabled:text-ink-3",
  selected: "bg-primary-soft text-primary-text ring-1 ring-inset ring-primary/40",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  icon,
  block = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${block ? "w-full" : ""} ${VARIANTS[variant]} ${className}`}
    >
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
