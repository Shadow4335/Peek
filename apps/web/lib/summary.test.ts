import { describe, expect, it } from "vitest";
import type { PlayerRow, RoomRow } from "@hideseek/shared";
import { buildResults, groupWaves } from "./summary";

const t0 = Date.parse("2026-11-07T12:00:00Z");
const iso = (min: number) => new Date(t0 + min * 60_000).toISOString();
const room = {
  id: "r",
  created_at: iso(-10),
  started_at: iso(-5),
  head_start_ends_at: iso(0),
  ends_at: iso(30),
  ended_at: iso(30),
} as RoomRow;
const p = (id: string, role: PlayerRow["role"], extra: Partial<PlayerRow> = {}) =>
  ({ id, display_name: id, role, caught_at: null, caught_by_player_id: null, catches_count: 0, ...extra }) as PlayerRow;

describe("buildResults", () => {
  it("ranks survivors first, then by survival time from seeker release", () => {
    const { hiders, seekers, matchMs } = buildResults(room, [
      p("early", "HIDER", { caught_at: iso(5), caught_by_player_id: "s1" }),
      p("late", "HIDER", { caught_at: iso(20), caught_by_player_id: "s1" }),
      p("alive", "HIDER"),
      p("s1", "SEEKER", { catches_count: 2 }),
      p("s2", "SEEKER"),
      p("spec", "UNASSIGNED"),
    ]);
    expect(hiders.map((h) => [h.player.id, h.survivedMs / 60_000, h.survived])).toEqual([
      ["alive", 30, true],
      ["late", 20, false],
      ["early", 5, false],
    ]);
    expect(hiders[1]!.caughtBy).toBe("s1");
    expect(seekers.map((s) => [s.player.id, s.catches])).toEqual([
      ["s1", 2],
      ["s2", 0],
    ]);
    expect(matchMs).toBe(30 * 60_000);
  });
});

describe("groupWaves", () => {
  it("groups rows by wave, oldest first", () => {
    const row = (w: number, pid: string) => ({
      id: `${w}${pid}`,
      room_id: "r",
      wave_number: w,
      player_id: pid,
      lat: 1,
      lng: 2,
      accuracy_m: 5,
      stale: false,
      heartbeat_at: iso(w),
      created_at: iso(w),
    });
    const waves = groupWaves([row(2, "a"), row(1, "a"), row(2, "b")], "r");
    expect(waves.map((w) => [w.waveNumber, w.pings.length])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
});
