"use client";

import type { AdminRoomSummary, RoomStatus } from "@hideseek/shared";
import { Radio, Search } from "lucide-react";
import { useMemo, useState } from "react";

const STATUS_TONE: Record<RoomStatus, string> = {
  LOBBY: "bg-neutral-800 text-neutral-200",
  HEAD_START: "bg-amber-900 text-warn",
  ACTIVE: "bg-lime-900 text-hider",
  ENDED: "bg-neutral-900 text-neutral-500",
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
      <div className="flex items-center gap-2 rounded-2xl bg-neutral-950 px-3 ring-1 ring-neutral-800">
        <Search className="size-4 text-neutral-500" aria-hidden />
        <input
          aria-label="Search room code"
          placeholder="Room code"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-12 flex-1 bg-transparent font-mono uppercase outline-none placeholder:normal-case"
        />
      </div>
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-neutral-900 p-1 text-sm font-semibold">
        {(["live", "all"] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`min-h-11 rounded-xl ${filter === f ? "bg-white text-black" : "text-neutral-400"}`}
          >
            {f === "live" ? "Open & live" : "All rooms"}
          </button>
        ))}
      </div>
      <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto pb-2" data-testid="room-list">
        {shown.length === 0 ? <li className="p-4 text-center text-sm text-neutral-500">No rooms.</li> : null}
        {shown.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 ${
                r.id === selectedId ? "bg-neutral-800 ring-white/40" : "bg-neutral-950 ring-neutral-800"
              }`}
            >
              <span className="font-mono text-lg font-black tracking-widest">{r.code}</span>
              <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[r.status]}`}>
                {r.status.replace("_", " ")}
              </span>
              {r.live ? <Radio className="size-4 text-hider" aria-label="Running on server" /> : null}
              <span className="ml-auto text-right text-xs text-neutral-400">
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
