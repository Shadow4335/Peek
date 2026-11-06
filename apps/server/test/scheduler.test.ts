import { describe, expect, it } from "vitest";
import { nextPingDelayMs } from "../src/game/scheduler";

const base = {
  minSecs: 60,
  maxSecs: 120,
  nowMs: 0,
  endsAtMs: 60 * 60_000,
  endgameWindowMs: 10 * 60_000,
  endgameMultiplier: 0.75,
};

describe("nextPingDelayMs", () => {
  it("draws uniformly between min and max", () => {
    expect(nextPingDelayMs({ ...base, random: () => 0 })).toBe(60_000);
    expect(nextPingDelayMs({ ...base, random: () => 0.5 })).toBe(90_000);
    expect(nextPingDelayMs({ ...base, random: () => 0.999999 })).toBeCloseTo(120_000, -1);
  });

  it("applies the 0.75x multiplier in the final 10 minutes", () => {
    const nowMs = base.endsAtMs - 9 * 60_000;
    expect(nextPingDelayMs({ ...base, nowMs, random: () => 0.5 })).toBe(67_500);
  });

  it("does not shrink before the endgame window", () => {
    const nowMs = base.endsAtMs - 11 * 60_000;
    expect(nextPingDelayMs({ ...base, nowMs, random: () => 0.5 })).toBe(90_000);
  });

  it("tolerates min > max", () => {
    expect(nextPingDelayMs({ ...base, minSecs: 120, maxSecs: 60, random: () => 0 })).toBe(60_000);
  });
});
