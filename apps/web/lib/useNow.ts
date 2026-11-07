"use client";

import { useEffect, useState } from "react";

/** Re-renders every `intervalMs` and returns Date.now(). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** m:ss, or h:mm:ss above an hour. Negative → 0:00. */
export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Relative age of a *capture* timestamp ("12 s ago", "3 min ago"). Returns
 * "time unavailable" rather than inventing "just now" when the time is unknown.
 */
export function formatAgo(iso: string | null | undefined, now: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "time unavailable";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
}

/** A snapshot counts as "fresh" for this long after it was captured. */
export const FRESH_PING_MS = 60_000;
