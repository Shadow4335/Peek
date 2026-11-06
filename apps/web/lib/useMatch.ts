"use client";

import {
  PING_HISTORY_OPACITY,
  type GeoFix,
  type HiderCaughtEvent,
  type OutOfBoundsEvent,
  type PingSnapshotRow,
  type PingWaveEvent,
  type PlayerRow,
  type RoomRow,
  type RoomStateEvent,
  type SeekerExposureEvent,
  type TagAttemptResponse,
  type TagRequestIncomingEvent,
  type TagRequestResolvedEvent,
} from "@hideseek/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured } from "./env";
import { friendlyError } from "./errors";
import { LONG_BUZZ, vibrate } from "./haptics";
import type { GameSocket } from "./socket";
import { groupWaves } from "./summary";
import { getSupabase } from "./supabase";

export type ToastTone = "info" | "good" | "bad" | "warn";
export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const next = { ...rec };
  delete next[key];
  return next;
}

export interface OutgoingRequest {
  requestId: string;
  hiderId: string;
  expiresAt: number;
}

const KEEP_WAVES = PING_HISTORY_OPACITY.length;

/**
 * Client-side match state fed by the game-server socket: ping history (last 3 waves),
 * seeker exposures, out-of-bounds hiders, tag requests, haptic alerts and toasts.
 */
export function useMatch(socket: GameSocket | null, room: RoomRow, me: PlayerRow | null, refresh: () => void) {
  const myId = me?.id ?? null;
  const [waves, setWaves] = useState<PingWaveEvent[]>([]);
  const [exposures, setExposures] = useState<Record<string, SeekerExposureEvent>>({});
  const [oob, setOob] = useState<Record<string, OutOfBoundsEvent>>({});
  const exposuresRef = useRef(exposures);
  useEffect(() => {
    exposuresRef.current = exposures;
  }, [exposures]);
  const [boundaryWarningAt, setBoundaryWarningAt] = useState<number | null>(null);
  const [incoming, setIncoming] = useState<TagRequestIncomingEvent | null>(null);
  const [outgoing, setOutgoing] = useState<OutgoingRequest | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [eligible, setEligible] = useState<Record<string, true>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const toast = useCallback((text: string, tone: ToastTone = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const addWave = useCallback((w: PingWaveEvent) => {
    setWaves((ws) =>
      [...ws.filter((x) => x.waveNumber !== w.waveNumber), w]
        .sort((a, b) => b.waveNumber - a.waveNumber)
        .slice(0, KEEP_WAVES),
    );
  }, []);

  // Initial ping history (reload mid-match).
  const latestWave = room.ping_wave_count;
  useEffect(() => {
    if (!isSupabaseConfigured || latestWave < 1) return;
    let cancelled = false;
    void getSupabase()
      .from("ping_snapshots")
      .select("*")
      .eq("room_id", room.id)
      .gt("wave_number", latestWave - KEEP_WAVES)
      .then(({ data }) => {
        if (cancelled || !data) return;
        for (const w of groupWaves(data as PingSnapshotRow[], room.id)) addWave(w);
      });
    return () => {
      cancelled = true;
    };
  }, [room.id, latestWave, addWave]);

  // Socket events.
  useEffect(() => {
    if (!socket) return;
    const onState = (s: RoomStateEvent) => {
      setExposures(Object.fromEntries(s.exposedSeekers.map((e) => [e.seekerPlayerId, e])));
      setOob(Object.fromEntries(s.outOfBoundsHiders.map((o) => [o.playerId, o])));
      setIncoming(s.pendingTagRequest);
    };
    const onWave = (w: PingWaveEvent) => {
      addWave(w);
      if (myId && w.pings.some((p) => p.playerId === myId)) toast("Ping sent — seekers saw your position", "warn");
    };
    const onPreWarning = (p: { inMs: number; haptic: number[] }) => {
      vibrate(p.haptic);
      toast(`Ping in ${Math.round(p.inMs / 1000)}s`, "warn");
    };
    const onBoundary = (p: { graceMs: number; haptic: number[] }) => {
      vibrate(p.haptic);
      setBoundaryWarningAt(Date.now() + p.graceMs);
    };
    const onOob = (o: OutOfBoundsEvent) => {
      setOob((m) => ({ ...m, [o.playerId]: o }));
    };
    const onBack = ({ playerId }: { playerId: string }) => {
      setOob((m) => omit(m, playerId));
      if (playerId === myId) setBoundaryWarningAt(null);
    };
    const onCaught = (c: HiderCaughtEvent) => {
      setOob((m) => omit(m, c.playerId));
      if (c.playerId === myId) {
        vibrate(LONG_BUZZ);
        setIncoming(null);
      }
      toast(c.playerId === myId ? "You were caught!" : `A hider was caught — ${c.hidersRemaining} left`, "good");
      refresh();
    };
    const onExposed = (e: SeekerExposureEvent) => {
      const prev = exposuresRef.current[e.seekerPlayerId];
      if (!prev || Date.parse(prev.until) < Date.now()) {
        if (e.seekerPlayerId === myId) toast("Two misses — hiders can see you for 30s!", "bad");
        else toast("A seeker is exposed for 30s — check the map", "good");
      }
      setExposures((m) => ({ ...m, [e.seekerPlayerId]: e }));
    };
    const onIncoming = (r: TagRequestIncomingEvent) => {
      vibrate(LONG_BUZZ);
      setIncoming(r);
    };
    const onResolved = (r: TagRequestResolvedEvent) => {
      setIncoming((cur) => (cur?.requestId === r.requestId ? null : cur));
      setOutgoing((cur) => (cur?.requestId === r.requestId ? null : cur));
      if (r.seekerPlayerId === myId) {
        const copy = {
          ACCEPTED: ["Tag confirmed!", "good"],
          DECLINED: ["Tag request declined", "bad"],
          EXPIRED: ["No answer — request expired", "warn"],
          CANCELLED: ["Tag request cancelled", "info"],
        } as const;
        const [text, tone] = copy[r.resolution];
        toast(text, tone);
      }
    };

    socket.on("room:state", onState);
    socket.on("ping:wave", onWave);
    socket.on("ping:pre_warning", onPreWarning);
    socket.on("hider:boundary_warning", onBoundary);
    socket.on("hider:out_of_bounds", onOob);
    socket.on("hider:back_in_bounds", onBack);
    socket.on("hider:caught", onCaught);
    socket.on("seeker:exposed", onExposed);
    socket.on("tag_request:incoming", onIncoming);
    socket.on("tag_request:resolved", onResolved);
    return () => {
      socket.off("room:state", onState);
      socket.off("ping:wave", onWave);
      socket.off("ping:pre_warning", onPreWarning);
      socket.off("hider:boundary_warning", onBoundary);
      socket.off("hider:out_of_bounds", onOob);
      socket.off("hider:back_in_bounds", onBack);
      socket.off("hider:caught", onCaught);
      socket.off("seeker:exposed", onExposed);
      socket.off("tag_request:incoming", onIncoming);
      socket.off("tag_request:resolved", onResolved);
    };
  }, [socket, myId, addWave, toast, refresh]);

  // --- Actions ----------------------------------------------------------------
  const tag = useCallback(
    async (hiderId: string, fix: GeoFix): Promise<TagAttemptResponse | null> => {
      if (!socket?.connected) {
        toast("Not connected to the game server", "bad");
        return null;
      }
      try {
        const r = await socket.timeout(8000).emitWithAck("seeker:tag", { hiderPlayerId: hiderId, seeker: fix });
        if (r.cooldownUntil) setCooldownUntil(Date.parse(r.cooldownUntil));
        if (r.result === "TAGGED") {
          vibrate(LONG_BUZZ);
          toast("Tagged!", "good");
        } else if (r.result === "OUT_OF_RANGE") {
          vibrate(250);
          toast("Out of range", "bad");
          if (r.tagRequestEligible) setEligible((e) => ({ ...e, [hiderId]: true }));
        } else if (r.result === "COOLDOWN") {
          toast("Tag locked — cooling down", "warn");
        } else {
          toast("Tag not possible right now", "warn");
        }
        return r;
      } catch {
        toast("Tag timed out — try again", "bad");
        return null;
      }
    },
    [socket, toast],
  );

  const requestTag = useCallback(
    async (hiderId: string) => {
      if (!socket?.connected) return toast("Not connected to the game server", "bad");
      try {
        const r = await socket.timeout(8000).emitWithAck("seeker:tag_request", { hiderPlayerId: hiderId });
        if (r.ok) {
          setOutgoing({ requestId: r.requestId, hiderId, expiresAt: Date.parse(r.expiresAt) });
          toast("Tag request sent — waiting for them to confirm", "info");
        } else {
          const copy: Record<string, string> = {
            NOT_ELIGIBLE: "Try a normal tag first",
            COOLDOWN: "Wait a moment before asking them again",
            REQUEST_PENDING: "You already have a request pending",
            HIDER_BUSY: "They're answering another request",
            HIDER_UNAVAILABLE: "That hider is already caught",
          };
          toast(copy[r.error] ?? friendlyError(r.error), "warn");
        }
      } catch {
        toast("Request timed out", "bad");
      }
    },
    [socket, toast],
  );

  const answerTagRequest = useCallback(
    (accept: boolean) => {
      if (!socket || !incoming) return;
      socket.emit("hider:tag_request_response", { requestId: incoming.requestId, accept });
      setIncoming(null);
    },
    [socket, incoming],
  );

  const surrender = useCallback(async () => {
    if (!socket?.connected) {
      toast("Not connected to the game server", "bad");
      return false;
    }
    try {
      const r = await socket.timeout(8000).emitWithAck("hider:self_surrender");
      if (!r.ok) toast(friendlyError(r.error), "bad");
      return r.ok;
    } catch {
      toast("Surrender timed out — try again", "bad");
      return false;
    }
  }, [socket, toast]);

  const exposureList = useMemo(() => Object.values(exposures), [exposures]);
  const oobList = useMemo(() => Object.values(oob), [oob]);

  return {
    waves,
    exposures: exposureList,
    outOfBounds: oobList,
    boundaryWarningAt,
    incoming,
    outgoing,
    cooldownUntil,
    eligible,
    toasts,
    toast,
    tag,
    requestTag,
    answerTagRequest,
    surrender,
  };
}
