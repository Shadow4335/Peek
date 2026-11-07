"use client";

import dynamic from "next/dynamic";

// MapLibre touches window/WebGL at import time — client only.
const GeofenceBuilder = dynamic(() => import("@/components/GeofenceBuilder"), {
  ssr: false,
  loading: () => <div className="grid flex-1 place-items-center text-sm text-ink-3">Loading map…</div>,
});

export function CreateRoomClient() {
  return <GeofenceBuilder />;
}
