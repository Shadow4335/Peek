"use client";

import type { PlayerRole, PlayerRow, RoomRow } from "@hideseek/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { friendlyError } from "./errors";
import { loadName, saveName } from "./player";
import { claimLobbyRole, fetchPlayers, fetchRoom, joinRoom, leaveRoom, setPlayerReady, startMatchRpc } from "./rpc";
import type { TimedFix } from "./useGeolocation";
import { useGameSocket } from "./socket";
import { getSupabase } from "./supabase";

export type RoomPhase = "loading" | "needs-name" | "ready" | "error" | "left";

const POLL_MS = 10_000;

/**
 * Loads a room by code (joining it idempotently), keeps room + roster live via
 * Supabase Realtime (with a polling fallback) and the game-server socket, and
 * exposes the lobby actions.
 */
export function useRoom(code: string) {
  const { socket, connected } = useGameSocket();
  const [phase, setPhase] = useState<RoomPhase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const roomId = room?.id ?? null;

  const enter = useCallback(
    async (name: string) => {
      setPhase("loading");
      setError(null);
      try {
        const me = await joinRoom(code, name);
        const [r, ps] = await Promise.all([fetchRoom(me.room_id), fetchPlayers(me.room_id)]);
        if (!r) throw new Error("ROOM_NOT_FOUND");
        setMeId(me.id);
        setRoom(r);
        setPlayers(ps);
        setPhase("ready");
      } catch (err) {
        setError(friendlyError(err));
        setPhase("error");
      }
    },
    [code],
  );

  // Initial entry with the saved name (or ask for one).
  useEffect(() => {
    const name = loadName().trim();
    const run = async () => {
      if (!name) setPhase("needs-name");
      else await enter(name);
    };
    void run();
  }, [enter]);

  const submitName = useCallback(
    (name: string) => {
      saveName(name);
      void enter(name.trim());
    },
    [enter],
  );

  // --- Live sync ----------------------------------------------------------------
  const refreshPlayers = useCallback(async () => {
    if (!roomId) return;
    try {
      const ps = await fetchPlayers(roomId);
      setPlayers(ps);
      if (meId && !ps.some((p) => p.id === meId)) setPhase("left");
    } catch {
      /* transient — next event / poll retries */
    }
  }, [roomId, meId]);

  const refreshRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      const r = await fetchRoom(roomId);
      if (r) setRoom(r);
      else setPhase("left"); // room deleted
    } catch {
      /* transient */
    }
  }, [roomId]);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void refreshPlayers(), 120);
  }, [refreshPlayers]);

  useEffect(() => {
    if (!roomId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`room:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` }, () =>
        scheduleRefresh(),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, (payload) =>
        setRoom(payload.new as RoomRow),
      )
      .subscribe();
    // Fallback: Realtime may drop DELETEs or disconnect on flaky mobile networks.
    const poll = setInterval(() => {
      void refreshPlayers();
      void refreshRoom();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshPlayers();
        void refreshRoom();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [roomId, scheduleRefresh, refreshPlayers, refreshRoom]);

  // Game-server socket: join the room channel; follow status pushes.
  useEffect(() => {
    if (!socket || !connected || !roomId) return;
    void socket.emitWithAck("room:join", { roomId }).catch(() => undefined);
    const onStatus = (s: { roomId: string }) => {
      if (s.roomId === roomId) void refreshRoom();
    };
    socket.on("room:status", onStatus);
    return () => {
      socket.off("room:status", onStatus);
    };
  }, [socket, connected, roomId, refreshRoom]);

  // --- Actions --------------------------------------------------------------------
  /** Each action resolves to an error message, or null on success. */
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await refreshPlayers();
        return null;
      } catch (err) {
        await refreshPlayers();
        return friendlyError(err);
      }
    },
    [refreshPlayers],
  );

  const claim = useCallback(
    (role: PlayerRole) => run(() => (roomId ? claimLobbyRole(roomId, role) : Promise.resolve())),
    [run, roomId],
  );

  const setReady = useCallback(
    (ready: boolean, fix?: TimedFix | null) => run(() => (roomId ? setPlayerReady(roomId, ready, fix) : Promise.resolve())),
    [run, roomId],
  );

  const start = useCallback(
    async (force: boolean) => {
      if (!roomId) return "Room not loaded.";
      try {
        if (socket?.connected) {
          const res = await socket.timeout(8000).emitWithAck("host:start_match", { roomId, force });
          if (!res.ok) return friendlyError(res.error);
        } else {
          await startMatchRpc(roomId, force);
        }
        await refreshRoom();
        return null;
      } catch (err) {
        return friendlyError(err);
      }
    },
    [roomId, socket, refreshRoom],
  );

  const leave = useCallback(async () => {
    if (!roomId) return null;
    try {
      await leaveRoom(roomId);
      setPhase("left");
      return null;
    } catch (err) {
      return friendlyError(err);
    }
  }, [roomId]);

  const me = useMemo(() => players.find((p) => p.id === meId) ?? null, [players, meId]);

  const refresh = useCallback(() => {
    void refreshPlayers();
    void refreshRoom();
  }, [refreshPlayers, refreshRoom]);

  return { phase, error, room, players, me, connected, submitName, claim, setReady, start, leave, refresh };
}
