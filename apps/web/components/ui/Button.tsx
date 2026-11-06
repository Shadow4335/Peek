import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-hider text-black active:bg-lime-300 disabled:bg-neutral-800 disabled:text-neutral-500",
  secondary:
    "bg-neutral-900 text-neutral-100 ring-1 ring-inset ring-neutral-700 active:bg-neutral-800 disabled:text-neutral-600",
  ghost: "bg-transparent text-neutral-300 active:bg-neutral-900 disabled:text-neutral-700",
  danger: "bg-seeker text-black active:bg-rose-300 disabled:bg-neutral-800 disabled:text-neutral-500",
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
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition-colors disabled:cursor-not-allowed ${
        block ? "w-full" : ""
      } ${VARIANTS[variant]} ${className}`}
    >
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
