import { AlertTriangle } from "lucide-react";

/** Error / problem notice. Announced to screen readers. */
export function ErrorNotice({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-button bg-danger-soft px-3 py-2.5 text-sm text-ink ring-1 ring-danger/40">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
