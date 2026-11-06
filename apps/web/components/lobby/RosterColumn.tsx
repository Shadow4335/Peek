import type { PlayerRole, PlayerRow } from "@hideseek/shared";
import { CircleCheck, CircleDashed, Crown } from "lucide-react";

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
  HIDER: { title: "Hiders", text: "text-hider", ring: "ring-lime-900", bg: "bg-lime-950/30", btn: "bg-hider text-black" },
  SEEKER: { title: "Seekers", text: "text-seeker", ring: "ring-rose-900", bg: "bg-rose-950/30", btn: "bg-seeker text-black" },
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
      className={`flex min-w-0 flex-col gap-2 rounded-3xl p-3 ring-1 ${t.ring} ${t.bg}`}
    >
      <header className="flex items-baseline justify-between">
        <h2 className={`text-sm font-bold uppercase tracking-wider ${t.text}`}>{t.title}</h2>
        <span className="font-mono text-xs text-neutral-400">
          {players.length}/{capacity}
        </span>
      </header>

      <ul className="flex flex-col gap-1.5">
        {players.map((p) => (
          <li
            key={p.id}
            className={`flex min-h-10 items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm ${
              p.id === meId ? "bg-white/10 ring-1 ring-white/30" : "bg-black/40"
            }`}
          >
            {p.is_ready ? (
              <CircleCheck className={`size-4 shrink-0 ${t.text}`} aria-label="Ready" />
            ) : (
              <CircleDashed className="size-4 shrink-0 text-neutral-600" aria-label="Not ready" />
            )}
            <span className="truncate">{p.display_name}</span>
            {p.id === meId ? <span className="text-[10px] uppercase text-neutral-400">you</span> : null}
            {p.is_host ? <Crown className="ml-auto size-3.5 shrink-0 text-warn" aria-label="Host" /> : null}
          </li>
        ))}
        {Array.from({ length: Math.min(open, MAX_PLACEHOLDERS) }).map((_, i) => (
          <li
            key={`open-${i}`}
            className="flex min-h-10 items-center rounded-xl border border-dashed border-neutral-800 px-2.5 text-xs text-neutral-600"
          >
            Open slot
          </li>
        ))}
        {open > MAX_PLACEHOLDERS ? (
          <li className="px-2.5 text-xs text-neutral-600">+{open - MAX_PLACEHOLDERS} more open</li>
        ) : null}
      </ul>

      {!mine ? (
        <button
          type="button"
          onClick={onClaim}
          disabled={busy || full}
          className={`mt-auto min-h-11 rounded-2xl text-sm font-bold disabled:bg-neutral-800 disabled:text-neutral-500 ${t.btn}`}
        >
          {full ? "Full" : `Join ${t.title}`}
        </button>
      ) : null}
    </section>
  );
}
