export interface PingDelayInput {
  minSecs: number;
  maxSecs: number;
  nowMs: number;
  endsAtMs: number;
  endgameWindowMs: number;
  endgameMultiplier: number;
  random: () => number;
}

/**
 * Random delay U(min, max) seconds until the next ping wave, shrunk by the endgame
 * multiplier (0.75×) once fewer than endgameWindowMs remain in the match.
 */
export function nextPingDelayMs(i: PingDelayInput): number {
  const lo = Math.min(i.minSecs, i.maxSecs);
  const hi = Math.max(i.minSecs, i.maxSecs);
  let delay = (lo + (hi - lo) * i.random()) * 1000;
  if (i.endsAtMs - i.nowMs <= i.endgameWindowMs) {
    delay *= i.endgameMultiplier;
  }
  return Math.max(0, Math.round(delay));
}
