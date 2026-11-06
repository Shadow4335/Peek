import type { InputHTMLAttributes } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function Field({ label, hint, id, className = "", ...rest }: FieldProps) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{label}</span>
      <input
        id={inputId}
        {...rest}
        className={`h-13 rounded-2xl bg-neutral-900 px-4 text-lg text-white ring-1 ring-inset ring-neutral-800 outline-none placeholder:text-neutral-600 focus:ring-2 focus:ring-hider ${className}`}
      />
      {hint ? <span className="text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}
