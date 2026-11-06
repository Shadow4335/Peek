import { buffer, circle } from "@turf/turf";
import { describe, expect, it } from "vitest";
import type { FenceGeometry } from "@hideseek/shared";
import { GEOFENCE_DRIFT_BUFFER_KM } from "@hideseek/shared";
import { isInsideFence } from "../src/game/geofence";

const fence = circle([-74, 40], 0.1, { steps: 64, units: "kilometers" }); // 100 m radius
const buffered = buffer(fence, GEOFENCE_DRIFT_BUFFER_KM, { units: "kilometers" })!;
const north = (m: number) => ({ lat: 40 + m / 111_195, lng: -74 });

describe("isInsideFence (12 m drift buffer)", () => {
  it("accepts the center and points just past the raw edge", () => {
    expect(isInsideFence(north(0), buffered.geometry as FenceGeometry)).toBe(true);
    expect(isInsideFence(north(105), buffered.geometry as FenceGeometry)).toBe(true);
    expect(isInsideFence(north(105), fence.geometry as FenceGeometry)).toBe(false);
  });

  it("rejects points beyond the buffer", () => {
    expect(isInsideFence(north(120), buffered.geometry as FenceGeometry)).toBe(false);
  });
});
