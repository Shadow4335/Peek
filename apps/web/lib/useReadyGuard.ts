"use client";

import { READY_REFRESH_MS, type PlayerRow } from "@hideseek/shared";
import { useEffect, useRef } from "react";
import type { TimedFix } from "./useGeolocation";
import type { ZoneState } from "./zone";

/**
 * Keeps a player's Ready honest:
 *  - leaving the zone / losing accuracy (or GPS permission) auto-cancels Ready;
 *  - while ready and inside, re-verifies every READY_REFRESH_MS so start_match sees
 *    a fresh (< 120 s) GPS check.
 */
export function useReadyGuard(
  me: PlayerRow | null,
  zone: ZoneState,
  fix: TimedFix | null,
  setReady: (ready: boolean, fix?: TimedFix | null) => Promise<string | null>,
) {
  const isReady = Boolean(me?.is_ready);
  const busy = useRef(false);
  const fixRef = useRef(fix);
  useEffect(() => {
    fixRef.current = fix;
  }, [fix]);

  const disqualified = zone === "outside" || zone === "inaccurate" || zone === "denied" || zone === "unavailable";
  useEffect(() => {
    if (!isReady || !disqualified || busy.current) return;
    busy.current = true;
    void setReady(false).finally(() => {
      busy.current = false;
    });
  }, [isReady, disqualified, setReady]);

  const inside = zone === "inside";
  useEffect(() => {
    if (!isReady || !inside) return;
    const t = setInterval(() => {
      if (fixRef.current) void setReady(true, fixRef.current);
    }, READY_REFRESH_MS);
    return () => clearInterval(t);
  }, [isReady, inside, setReady]);
}
