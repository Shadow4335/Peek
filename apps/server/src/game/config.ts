import {
  ENDGAME_PING_MULTIPLIER,
  ENDGAME_WINDOW_MS,
  OUT_OF_BOUNDS_GRACE_MS,
  PRE_PING_WARNING_MS,
  TAG_FAIL_COOLDOWN_MS,
  TAG_FRESH_FIX_TIMEOUT_MS,
  TAG_REQUEST_CONFIRM_MS,
  TAG_REQUEST_ELIGIBLE_STALE_MS,
  TAG_STRIKE_WINDOW_MS,
} from "@hideseek/shared";

/** Timing knobs for a room runtime. Defaults come from @hideseek/shared; tests shrink them. */
export interface RuntimeConfig {
  preWarningMs: number;
  endgameWindowMs: number;
  endgameMultiplier: number;
  freshFixTimeoutMs: number;
  outOfBoundsGraceMs: number;
  tagRequestConfirmMs: number;
  /** Hider telemetry older than this makes the seeker eligible for a Tag Request. */
  tagRequestEligibleStaleMs: number;
  /** A failed tag on a hider keeps the Tag Request option open for this long. */
  tagRequestAfterFailMs: number;
  /** After a hider declines/ignores, the same seeker can't re-request them for this long. */
  tagRequestRetryCooldownMs: number;
  /** Drop heartbeats arriving faster than this (fresh fixes are exempt). */
  heartbeatMinIntervalMs: number;
  seekerLocationMinIntervalMs: number;
  /** Uniform [0,1) source for ping jitter. */
  random: () => number;
}

export const defaultRuntimeConfig: RuntimeConfig = {
  preWarningMs: PRE_PING_WARNING_MS,
  endgameWindowMs: ENDGAME_WINDOW_MS,
  endgameMultiplier: ENDGAME_PING_MULTIPLIER,
  freshFixTimeoutMs: TAG_FRESH_FIX_TIMEOUT_MS,
  outOfBoundsGraceMs: OUT_OF_BOUNDS_GRACE_MS,
  tagRequestConfirmMs: TAG_REQUEST_CONFIRM_MS,
  tagRequestEligibleStaleMs: TAG_REQUEST_ELIGIBLE_STALE_MS,
  tagRequestAfterFailMs: TAG_STRIKE_WINDOW_MS,
  tagRequestRetryCooldownMs: TAG_FAIL_COOLDOWN_MS,
  heartbeatMinIntervalMs: 2_000,
  seekerLocationMinIntervalMs: 1_000,
  random: Math.random,
};
