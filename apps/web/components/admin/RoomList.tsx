"use client";

import type { AdminRoomSummary, RoomStatus } from "@hideseek/shared";
import { Radio, Search } from "lucide-react";
import { useMemo, useState } from "react";

const STATUS_TONE: Record<RoomStatus, string> = {
  LOBBY: "bg-surface-hover text-ink",
  HEAD_START: "bg-reward-soft text-reward",
  ACTIVE: "bg-accent-soft text-accent",
  ENDED: "bg-surface-raised text-ink-3",
};

type Filter = "live" | "all";

export function RoomList({
  rooms,
  selectedId,
  onSelect,
}: {
  rooms: AdminRoomSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("live");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return rooms
      .filter((r) => filter === "all" || r.status !== "ENDED")
      .filter((r) => !needle || r.code.includes(needle));
  }, [rooms, filter, q]);

  return (
    <aside className="flex min-h-0 flex-col gap-3" aria-label="Rooms">
      <div className="flex items-center gap-2 rounded-button bg-surface px-3 ring-1 ring-line">
        <Search className="size-4 text-ink-3" aria-hidden />
        <input
          aria-label="Search room code"
          placeholder="Room code"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-12 flex-1 bg-transparent font-mono uppercase outline-none placeholder:normal-case"
        />
      </div>
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-button bg-surface-raised p-1 text-sm font-semibold">
        {(["live", "all"] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`min-h-11 rounded-xl ${filter === f ? "bg-primary-soft text-primary-text ring-1 ring-inset ring-primary/40" : "text-ink-2"}`}
          >
            {f === "live" ? "Open & live" : "All rooms"}
          </button>
        ))}
      </div>
      <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto pb-2" data-testid="room-list">
        {shown.length === 0 ? <li className="p-4 text-center text-sm text-ink-3">No rooms.</li> : null}
        {shown.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              className={`flex w-full items-center gap-3 rounded-button p-3 text-left ring-1 ${
                r.id === selectedId ? "bg-surface-hover ring-primary-text/60" : "bg-surface ring-line"
              }`}
            >
              <span className="font-mono text-lg font-bold tracking-widest">{r.code}</span>
              <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[r.status]}`}>
                {r.status.replace("_", " ")}
              </span>
              {r.live ? <Radio className="size-4 text-accent" aria-label="Running on server" /> : null}
              <span className="ml-auto text-right text-xs text-ink-2">
                {r.players} players
                <br />
                {r.hidersLeft}/{r.hiders} hiding · {r.seekers} seek
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
