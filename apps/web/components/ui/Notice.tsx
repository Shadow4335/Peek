import { AlertTriangle } from "lucide-react";

export function ErrorNotice({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-950/60 px-3 py-2 text-sm text-rose-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
