import { describe, expect, it } from "vitest";
import { analyzeFence, bufferFence, circlePolygon, formatArea, polygonFromVertices, type LngLat } from "./geofence";

const d = 0.001; // ≈ 111 m lat
const square: LngLat[] = [
  [-74 - d, 40 - d],
  [-74 + d, 40 - d],
  [-74 + d, 40 + d],
  [-74 - d, 40 + d],
];

describe("geofence helpers", () => {
  it("needs 3+ vertices and closes the ring", () => {
    expect(polygonFromVertices(square.slice(0, 2))).toBeNull();
    const p = polygonFromVertices(square)!;
    expect(p.coordinates[0]).toHaveLength(5);
    expect(p.coordinates[0]![0]).toEqual(p.coordinates[0]![4]);
  });

  it("computes area and flags bow-tie polygons via turf.kinks", () => {
    const ok = analyzeFence(polygonFromVertices(square));
    expect(ok.issue).toBeNull();
    // 222 m × (222 m · cos 40°) ≈ 37.9k m²
    expect(ok.areaM2).toBeGreaterThan(37_000);
    expect(ok.areaM2).toBeLessThan(39_000);

    const bowtie: LngLat[] = [square[0]!, square[2]!, square[1]!, square[3]!];
    expect(analyzeFence(polygonFromVertices(bowtie)).issue).toBe("SELF_INTERSECTS");
  });

  it("builds a 64-step circle with ≈ πr² area", () => {
    const c = circlePolygon([-74, 40], 200);
    expect(c.coordinates[0]).toHaveLength(65);
    expect(analyzeFence(c).areaM2).toBeCloseTo(Math.PI * 200 * 200, -3);
  });

  it("rejects tiny and huge zones", () => {
    expect(analyzeFence(circlePolygon([-74, 40], 20)).issue).toBe("TOO_SMALL");
    expect(analyzeFence(circlePolygon([-74, 40], 5000)).issue).toBe("TOO_LARGE");
  });

  it("drift buffer grows the zone by ~12 m", () => {
    const c = circlePolygon([-74, 40], 200);
    const b = bufferFence(c)!;
    expect(b.type).toBe("Polygon");
    const grown = analyzeFence(b as never).areaM2;
    expect(grown).toBeCloseTo(Math.PI * 212 * 212, -3);
  });

  it("formats areas", () => {
    expect(formatArea(950)).toBe("950 m²");
    expect(formatArea(45_000)).toBe("4.50 ha");
    expect(formatArea(2_500_000)).toBe("2.50 km²");
  });
});
