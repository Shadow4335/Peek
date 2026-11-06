"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { SlideToConfirm } from "@/components/ui/SlideToConfirm";

const DOUBLE_TAP_MS = 350;
const UNLOCK_VISIBLE_MS = 5000;

/**
 * Stealth Pocket Mode: pure #000 OLED blackout that swallows every touch. Double-tap
 * reveals a dim slider for 5 s; sliding it exits. Haptics keep working underneath.
 */
export function StealthOverlay({ onExit, wakeLockHeld }: { onExit: () => void; wakeLockHeld: boolean }) {
  const [unlockVisible, setUnlockVisible] = useState(false);
  const [hint, setHint] = useState(true);
  const lastTap = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 3000);
    return () => {
      clearTimeout(t);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const onTap = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // ignore taps on the slider itself
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      setUnlockVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setUnlockVisible(false), UNLOCK_VISIBLE_MS);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  return (
    <div
      data-testid="stealth-overlay"
      onPointerUp={onTap}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-[60] flex touch-none flex-col justify-end bg-[#000000] p-6 select-none"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 2rem)" }}
    >
      {hint ? (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-xs text-neutral-800">
          Stealth on{wakeLockHeld ? "" : " (screen may sleep)"} · double-tap to unlock
        </p>
      ) : null}
      {unlockVisible ? <SlideToConfirm stealth tone="neutral" label="Slide to unlock" onConfirm={onExit} /> : null}
    </div>
  );
}
