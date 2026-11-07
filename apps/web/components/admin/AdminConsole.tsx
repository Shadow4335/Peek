"use client";

import type { AdminRoomDetail, AdminRoomSummary } from "@hideseek/shared";
import { LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ErrorNotice } from "@/components/ui/Notice";
import { AdminError, adminApi, adminErrorText, adminToken } from "@/lib/admin";
import { useNow } from "@/lib/useNow";
import { LoginCard } from "./LoginCard";
import { RoomDetail } from "./RoomDetail";
import { RoomList } from "./RoomList";

const ROOMS_POLL_MS = 5000;
const DETAIL_POLL_MS = 2000;

/** iPad-first referee console: room list on the left, live room view on the right. */
export function AdminConsole() {
  const token = useSyncExternalStore(adminToken.subscribe, adminToken.get, () => null);
  if (!token) {
    return (
      <div className="flex flex-1 p-6">
        <LoginCard />
      </div>
    );
  }
  return <Dashboard />;
}

function Dashboard() {
  const now = useNow(1000);
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminRoomDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const loadRooms = useCallback(async () => {
    try {
      setRooms(await adminApi.rooms());
      setError(null);
    } catch (err) {
      if (!(err instanceof AdminError && err.status === 401)) setError(adminErrorText(err));
    }
  }, []);

  useEffect(() => {
    const kick = setTimeout(() => void loadRooms(), 0);
    const t = setInterval(() => void loadRooms(), ROOMS_POLL_MS);
    return () => {
      clearTimeout(kick);
      clearInterval(t);
    };
  }, [loadRooms, tick]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const load = async () => {
      try {
        const d = await adminApi.room(selected);
        if (!cancelled) setDetail(d);
      } catch (err) {
        if (!cancelled && !(err instanceof AdminError && err.status === 401)) setError(adminErrorText(err));
      }
    };
    const kick = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), DETAIL_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(kick);
      clearInterval(t);
    };
  }, [selected, tick]);

  const shownDetail = detail && detail.room.id === selected ? detail : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6" style={{ paddingTop: "max(env(safe-area-inset-top), 1rem)" }}>
      <header className="flex items-center gap-3">
        <ShieldCheck className="size-6 text-reward" aria-hidden />
        <h1 className="text-xl font-bold">Referee console</h1>
        <span className="text-sm text-ink-3">{rooms.filter((r) => r.status !== "ENDED").length} open</span>
        <button
          type="button"
          onClick={() => setTick((t) => t + 1)}
          aria-label="Refresh"
          className="ml-auto grid size-11 place-items-center rounded-xl bg-surface-raised ring-1 ring-line"
        >
          <RefreshCw className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => adminToken.set(null)}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-raised px-4 text-sm font-semibold ring-1 ring-line"
        >
          <LogOut className="size-4" aria-hidden /> Sign out
        </button>
      </header>

      <ErrorNotice>{error}</ErrorNotice>

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[260px_1fr] xl:grid-cols-[300px_1fr]">
        <RoomList rooms={rooms} selectedId={selected} onSelect={setSelected} />
        {shownDetail ? (
          <RoomDetail detail={shownDetail} now={now} onChanged={() => setTick((t) => t + 1)} />
        ) : (
          <div className="grid place-items-center rounded-card border border-dashed border-line text-ink-3">
            {selected ? "Loading room…" : "Select a room"}
          </div>
        )}
      </div>
    </div>
  );
}
