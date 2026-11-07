"use client";

import { AttributionControl, getVersion, Map as MlMap, setWorkerUrl, type LngLatLike, type MapEventType } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useState, type RefObject } from "react";
import { publicEnv } from "@/lib/env";
import { applyPeekMapTheme } from "./mapTheme";

export interface MapInit {
  center?: LngLatLike;
  zoom?: number;
  /** false = static preview (no gestures). */
  interactive?: boolean;
}

// Static copy made by scripts/copy-maplibre-worker.mjs (predev / prebuild).
setWorkerUrl(`/vendor/maplibre-gl-worker-${getVersion()}.mjs`);

/** Creates a MapLibre map in `container` and returns it once the style has loaded. */
export function useMaplibre(container: RefObject<HTMLDivElement | null>, init: MapInit = {}) {
  const [map, setMap] = useState<MlMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const m = new MlMap({
      container: el,
      style: publicEnv.mapStyleUrl,
      center: init.center ?? [0, 20],
      zoom: init.zoom ?? 2,
      // Bottom of the screen is covered by sheets; attribution lives top-left.
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      interactive: init.interactive ?? true,
    });
    m.addControl(new AttributionControl({ compact: true }), "top-left");
    m.touchZoomRotate.disableRotation();
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __hsMap?: MlMap }).__hsMap = m; // dev-only handle for manual QA
    }
    m.keyboard.disableRotation();
    const onLoad = () => {
      // Compact attribution starts expanded; collapse it so it doesn't cover small maps.
      el.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      applyPeekMapTheme(m);
      setMap(m);
    };
    const onError = (e: MapEventType["error"]) => {
      if (!m.loaded()) setError(e.error?.message ?? "Map failed to load");
    };
    m.on("load", onLoad);
    m.on("error", onError);
    return () => {
      m.off("load", onLoad);
      m.off("error", onError);
      m.remove();
      setMap(null);
    };
    // Init options only apply on creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  return { map, error };
}
