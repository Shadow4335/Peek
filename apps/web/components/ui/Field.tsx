import type { InputHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

/** Label above, hint below — never placeholder-as-label. */
export function Field({ label, hint, id, className = "", ...rest }: FieldProps) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-2">{label}</span>
      <input
        id={inputId}
        {...rest}
        className={`min-h-12 rounded-button bg-surface-raised px-4 text-base text-ink ring-1 ring-inset ring-line outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-primary-text ${className}`}
      />
      {hint ? <span className="text-xs text-ink-2">{hint}</span> : null}
    </label>
  );
}

/** Shared input styling for one-off inputs that need custom layout. */
export const INPUT_CLASS =
  "min-h-12 rounded-button bg-surface-raised px-4 text-base text-ink ring-1 ring-inset ring-line outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-primary-text";
