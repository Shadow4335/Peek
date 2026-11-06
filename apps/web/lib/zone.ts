import { booleanPointInPolygon, point } from "@turf/turf";
import { READY_MAX_ACCURACY_M, type FenceGeometry, type GeoFix } from "@hideseek/shared";
import type { GeoStatus } from "./useGeolocation";

export type ZoneState = "locating" | "denied" | "unavailable" | "inaccurate" | "outside" | "inside";

type TurfPolygonal = Parameters<typeof booleanPointInPolygon>[1];

export function isInside(fix: { lat: number; lng: number }, fence: FenceGeometry): boolean {
  return booleanPointInPolygon(point([fix.lng, fix.lat]), fence as unknown as TurfPolygonal);
}

/**
 * Pre-flight GPS check mirrored from set_player_ready: accuracy ≤ 30 m and inside the
 * 12 m drift-buffered fence. The server re-checks; this only drives the UI.
 */
export function assessZone(fix: GeoFix | null, status: GeoStatus, buffered: FenceGeometry | null): ZoneState {
  if (status === "denied") return "denied";
  if (status === "unavailable") return "unavailable";
  if (!fix || !buffered) return "locating";
  if (fix.accuracy_m > READY_MAX_ACCURACY_M) return "inaccurate";
  return isInside(fix, buffered) ? "inside" : "outside";
}
