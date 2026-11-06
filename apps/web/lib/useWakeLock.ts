"use client";

import { useEffect, useState } from "react";

type Sentinel = { release: () => Promise<void>; released: boolean; addEventListener: (t: "release", cb: () => void) => void };

/**
 * Holds a screen wake lock while `active` so mobile browsers keep the page (and its
 * GPS watch + socket) alive. Re-acquired when the tab becomes visible again, because
 * the OS drops it whenever the page is hidden.
 */
export function useWakeLock(active: boolean) {
  const [held, setHeld] = useState(false);
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  useEffect(() => {
    if (!active || !supported) return;
    let sentinel: Sentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const wl = (navigator as unknown as { wakeLock: { request: (t: "screen") => Promise<Sentinel> } }).wakeLock;
        const s = await wl.request("screen");
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel = s;
        setHeld(true);
        s.addEventListener("release", () => setHeld(false));
      } catch {
        setHeld(false);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active, supported]);

  return { supported, held: active && held };
}
