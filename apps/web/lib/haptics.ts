import { HAPTIC_PATTERN } from "@hideseek/shared";

/** navigator.vibrate guard (no-op on iOS Safari / desktop). */
export function vibrate(pattern: number | readonly number[] = HAPTIC_PATTERN) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
    }
  } catch {
    /* ignore */
  }
}

export const LONG_BUZZ = [400, 150, 400, 150, 400] as const;
