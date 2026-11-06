"use client";

import { HEARTBEAT_INTERVAL_MS, type HeartbeatPayload } from "@hideseek/shared";
import { useEffect, useRef } from "react";
import type { GameSocket } from "./socket";
import type { TimedFix } from "./useGeolocation";

type BatteryManagerLike = { level: number };

async function batteryLevel(): Promise<number | null> {
  try {
    const nav = navigator as unknown as { getBattery?: () => Promise<BatteryManagerLike> };
    return nav.getBattery ? (await nav.getBattery()).level : null;
  } catch {
    return null;
  }
}

const toPayload = (fix: TimedFix, battery: number | null): HeartbeatPayload => ({
  lat: fix.lat,
  lng: fix.lng,
  accuracy_m: fix.accuracy_m,
  battery,
  updated_at: new Date(fix.timestamp).toISOString(),
});

/**
 * Hider → server private telemetry:
 *  - heartbeat every HEARTBEAT_INTERVAL_MS with the latest watched fix (+ immediately on the first fix);
 *  - answers FORCE_GPS_FLUSH with a brand-new fix (maximumAge 0) inside the server's window,
 *    falling back to the watched fix if it is < 5 s old.
 */
export function useHiderTelemetry(socket: GameSocket | null, enabled: boolean, fix: TimedFix | null) {
  const fixRef = useRef(fix);
  const sentFirst = useRef(false);
  useEffect(() => {
    fixRef.current = fix;
  }, [fix]);

  // Heartbeat loop.
  useEffect(() => {
    if (!socket || !enabled) return;
    const send = async () => {
      const f = fixRef.current;
      if (!f) return;
      socket.emit("hider:heartbeat", toPayload(f, await batteryLevel()));
    };
    const t = setInterval(() => void send(), HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [socket, enabled]);

  // First fix goes out immediately rather than waiting a full interval.
  const hasFix = fix !== null;
  useEffect(() => {
    if (!socket || !enabled || !hasFix || sentFirst.current || !fixRef.current) return;
    sentFirst.current = true;
    socket.emit("hider:heartbeat", toPayload(fixRef.current, null));
  }, [socket, enabled, hasFix]);

  // FORCE_GPS_FLUSH handshake.
  useEffect(() => {
    if (!socket || !enabled) return;
    const onFlush = ({ requestId, timeoutMs }: { requestId: string; timeoutMs: number }) => {
      const fallback = () => {
        const f = fixRef.current;
        if (f && Date.now() - f.timestamp < 5000) {
          socket.emit("hider:fresh_fix", { ...toPayload(f, null), requestId });
        }
      };
      if (!("geolocation" in navigator)) return fallback();
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          socket.emit("hider:fresh_fix", {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
            battery: null,
            updated_at: new Date(pos.timestamp).toISOString(),
            requestId,
          }),
        fallback,
        { enableHighAccuracy: true, maximumAge: 0, timeout: Math.max(500, timeoutMs - 400) },
      );
    };
    socket.on("FORCE_GPS_FLUSH", onFlush);
    return () => {
      socket.off("FORCE_GPS_FLUSH", onFlush);
    };
  }, [socket, enabled]);
}

/** Seeker → server location (only used by the server while the seeker is exposed). */
export function useSeekerBeacon(socket: GameSocket | null, enabled: boolean, fix: TimedFix | null) {
  const fixRef = useRef(fix);
  useEffect(() => {
    fixRef.current = fix;
  }, [fix]);
  useEffect(() => {
    if (!socket || !enabled) return;
    const t = setInterval(() => {
      const f = fixRef.current;
      if (f) socket.emit("seeker:location", { lat: f.lat, lng: f.lng, accuracy_m: f.accuracy_m });
    }, 3000);
    return () => clearInterval(t);
  }, [socket, enabled]);
}
