import { booleanPointInPolygon, point } from "@turf/turf";
import type { FenceGeometry, LatLng } from "@hideseek/shared";

type TurfPolygonal = Parameters<typeof booleanPointInPolygon>[1];

/** True when the fix is inside the (drift-buffered) play zone. Boundary counts as inside. */
export function isInsideFence(fix: LatLng, fence: FenceGeometry): boolean {
  return booleanPointInPolygon(point([fix.lng, fix.lat]), fence as unknown as TurfPolygonal);
}
