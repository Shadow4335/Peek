"use client";

import type { GeoFix } from "@hideseek/shared";
import { useEffect, useState } from "react";

export interface TimedFix extends GeoFix {
  /** Epoch ms of the fix (GeolocationPosition.timestamp). */
  timestamp: number;
}

export type GeoStatus = "idle" | "locating" | "ok" | "denied" | "unavailable";

/** Watches the device position with high accuracy. Stops when disabled or unmounted/hidden. */
export function useGeolocation(enabled = true) {
  const [fix, setFix] = useState<TimedFix | null>(null);
  const [reported, setReported] = useState<GeoStatus | null>(null);
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;

  useEffect(() => {
    if (!enabled || !supported) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
        setReported("ok");
      },
      (err) => setReported(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, supported]);

  const status: GeoStatus = !supported ? "unavailable" : !enabled ? "idle" : (reported ?? "locating");
  return { fix, status };
}
