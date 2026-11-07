import type { PlayerRole, PlayerRow } from "@hideseek/shared";
import { CircleCheck, CircleDashed, Crown, EyeOff, ScanEye } from "lucide-react";
import { initialOf } from "@/components/map/markers";

interface RosterColumnProps {
  role: Exclude<PlayerRole, "UNASSIGNED">;
  players: PlayerRow[];
  capacity: number;
  meId: string | null;
  myRole: PlayerRole | null;
  busy: boolean;
  onClaim: () => void;
}

const THEME = {
  HIDER: { title: "Hiders", text: "text-hider", ring: "ring-hider/30", bg: "bg-hider-soft/40", btn: "bg-hider text-on-accent" },
  SEEKER: { title: "Seekers", text: "text-seeker-text", ring: "ring-seeker/35", bg: "bg-seeker-soft/50", btn: "bg-seeker text-on-primary" },
} as const;

const MAX_PLACEHOLDERS = 4;

export function RosterColumn({ role, players, capacity, meId, myRole, busy, onClaim }: RosterColumnProps) {
  const t = THEME[role];
  const open = Math.max(0, capacity - players.length);
  const mine = myRole === role;
  const full = open === 0;

  return (
    <section
      aria-label={t.title}
      data-testid={`column-${role}`}
      className={`flex min-w-0 flex-col gap-2 rounded-card p-3 ring-1 ${t.ring} ${t.bg}`}
    >
      <header className="flex items-center justify-between">
        <h2 className={`flex items-center gap-1.5 text-lg ${t.text}`}>
          {role === "HIDER" ? <EyeOff className="size-4" aria-hidden /> : <ScanEye className="size-4" aria-hidden />}
          {t.title}
        </h2>
        <span className="peek-timer text-sm text-ink-2">
          {players.length}/{capacity}
        </span>
      </header>

      <ul className="flex flex-col gap-1.5">
        {players.map((p) => (
          <li
            key={p.id}
            className={`flex min-h-11 items-center gap-2 rounded-button px-2 py-1.5 text-sm animate-enter ${
              p.id === meId ? "bg-primary-soft ring-1 ring-primary/50" : "bg-surface/70"
            }`}
          >
            <span
              aria-hidden
              className={`relative grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                role === "HIDER" ? "bg-hider-soft text-hider" : "bg-seeker-soft text-seeker-text"
              }`}
            >
              {initialOf(p.display_name)}
              {p.is_ready ? (
                <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-accent ring-2 ring-surface" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate">{p.display_name}</span>
            {p.is_ready ? (
              <CircleCheck className="size-4 shrink-0 text-accent" aria-label="Ready" />
            ) : (
              <CircleDashed className="size-4 shrink-0 text-ink-3" aria-label="Not ready" />
            )}
            {p.id === meId ? <span className="sr-only">(you)</span> : null}
            {p.is_host ? <Crown className="size-3.5 shrink-0 text-reward" aria-label="Host" /> : null}
          </li>
        ))}
        {Array.from({ length: Math.min(open, MAX_PLACEHOLDERS) }).map((_, i) => (
          <li
            key={`open-${i}`}
            className="flex min-h-11 items-center rounded-button border border-dashed border-line px-2.5 text-xs text-ink-2"
          >
            Open slot
          </li>
        ))}
        {open > MAX_PLACEHOLDERS ? (
          <li className="px-2.5 text-xs text-ink-3">+{open - MAX_PLACEHOLDERS} more open</li>
        ) : null}
      </ul>

      {!mine ? (
        <button
          type="button"
          onClick={onClaim}
          disabled={busy || full}
          className={`mt-auto min-h-12 rounded-button text-sm font-semibold transition-transform duration-150 active:scale-[.97] disabled:bg-surface-hover disabled:text-ink-3 ${t.btn}`}
        >
          {full ? "Full" : `Join ${t.title}`}
        </button>
      ) : null}
    </section>
  );
}
