import { area, buffer, circle, kinks, polygon } from "@turf/turf";
import {
  GEOFENCE_CIRCLE_STEPS,
  GEOFENCE_DRIFT_BUFFER_KM,
  type FenceGeometry,
  type PolygonGeometry,
} from "@hideseek/shared";

export type LngLat = [number, number];

export const MIN_AREA_M2 = 2_000;
/** Mirrors the rooms.geofence_area_m2 CHECK (≤ 50 km²). */
export const MAX_AREA_M2 = 50_000_000;
export const MAX_VERTICES = 200;
export const CIRCLE_RADIUS = { min: 50, max: 1500, step: 10, default: 250 } as const;

/** Closed GeoJSON polygon from ≥ 3 tapped vertices, else null. */
export function polygonFromVertices(vertices: LngLat[]): PolygonGeometry | null {
  if (vertices.length < 3) return null;
  const ring = [...vertices, vertices[0]!];
  return { type: "Polygon", coordinates: [ring] };
}

/** Quick Circle mode: 64-vertex polygon via turf.circle. */
export function circlePolygon(center: LngLat, radiusM: number): PolygonGeometry {
  const c = circle(center, radiusM / 1000, { steps: GEOFENCE_CIRCLE_STEPS, units: "kilometers" });
  return c.geometry as PolygonGeometry;
}

/** 12 m outer drift buffer for out-of-bounds enforcement. */
export function bufferFence(geometry: PolygonGeometry): FenceGeometry | null {
  const b = buffer(polygon(geometry.coordinates as number[][][]), GEOFENCE_DRIFT_BUFFER_KM, {
    units: "kilometers",
  });
  return (b?.geometry as FenceGeometry | undefined) ?? null;
}

export type FenceIssue = "TOO_FEW_POINTS" | "SELF_INTERSECTS" | "TOO_SMALL" | "TOO_LARGE" | "TOO_MANY_POINTS";

export interface FenceAnalysis {
  geometry: PolygonGeometry | null;
  areaM2: number;
  issue: FenceIssue | null;
}

export function analyzeFence(geometry: PolygonGeometry | null, vertexCount?: number): FenceAnalysis {
  if (!geometry) return { geometry: null, areaM2: 0, issue: "TOO_FEW_POINTS" };
  if (vertexCount !== undefined && vertexCount > MAX_VERTICES) {
    return { geometry, areaM2: 0, issue: "TOO_MANY_POINTS" };
  }
  const feature = polygon(geometry.coordinates as number[][][]);
  const selfIntersects = kinks(feature).features.length > 0;
  const areaM2 = area(feature);
  let issue: FenceIssue | null = null;
  if (selfIntersects) issue = "SELF_INTERSECTS";
  else if (areaM2 < MIN_AREA_M2) issue = "TOO_SMALL";
  else if (areaM2 > MAX_AREA_M2) issue = "TOO_LARGE";
  return { geometry, areaM2, issue };
}

export const ISSUE_TEXT: Record<FenceIssue, string> = {
  TOO_FEW_POINTS: "Drop at least 3 pins to close the zone.",
  SELF_INTERSECTS: "Edges cross each other — drag a pin or undo to fix the shape.",
  TOO_SMALL: `Zone is too small (min ${formatArea(MIN_AREA_M2)}).`,
  TOO_LARGE: `Zone is too large (max ${formatArea(MAX_AREA_M2)}).`,
  TOO_MANY_POINTS: `Too many pins (max ${MAX_VERTICES}).`,
};

export function formatArea(m2: number): string {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(2)} km²`;
  if (m2 >= 10_000) return `${(m2 / 10_000).toFixed(2)} ha`;
  return `${Math.round(m2).toLocaleString("en-US")} m²`;
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
