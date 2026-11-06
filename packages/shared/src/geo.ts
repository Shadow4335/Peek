import {
  EARTH_RADIUS_M,
  TAG_BORDERLINE_MAX_M,
  TAG_MAX_ACCURACY_DISCOUNT_M,
  TAG_SUCCESS_THRESHOLD_M,
} from "./constants";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeoFix extends LatLng {
  accuracy_m: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters (same formula as SQL haversine_m). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Option C uncertainty-adjusted distance. Server-side only; never send to clients. */
export function effectiveTagDistance(seeker: GeoFix, hider: GeoFix) {
  const raw = haversineMeters(seeker, hider);
  const discount = Math.min(
    Math.max(seeker.accuracy_m, 0) + Math.max(hider.accuracy_m, 0),
    TAG_MAX_ACCURACY_DISCOUNT_M,
  );
  const effective = Math.max(0, raw - discount);
  return {
    raw,
    discount,
    effective,
    success: effective <= TAG_SUCCESS_THRESHOLD_M,
    borderline: effective > TAG_SUCCESS_THRESHOLD_M && effective <= TAG_BORDERLINE_MAX_M,
  };
}
