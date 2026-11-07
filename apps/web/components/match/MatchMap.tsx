"use client";

import { bbox, circle } from "@turf/turf";
import {
  PING_HISTORY_OPACITY,
  PING_MIN_RENDER_RADIUS_M,
  type FenceGeometry,
  type GeoFix,
  type PolygonGeometry,
} from "@hideseek/shared";
import { Maximize, LocateFixed } from "lucide-react";
import { Marker, type Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { COLORS, ensureFenceLayers, feature, setGeoJson } from "@/components/map/layers";
import { labelElement, pulseElement, userDotElement } from "@/components/map/markers";
import { syncMarkers } from "@/components/map/syncMarkers";
import { useMaplibre } from "@/components/map/useMaplibre";

export interface PingDot {
  playerId: string;
  label: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  stale: boolean;
  /** 0 = latest wave, 1 = N-1, 2 = N-2. */
  rank: number;
}

export interface LiveMarker {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: "oob-hider" | "exposed-seeker";
}

interface Props {
  fence: PolygonGeometry;
  buffered: FenceGeometry;
  myFix: GeoFix | null;
  pings?: PingDot[];
  markers?: LiveMarker[];
  /** Space covered by overlays (px) so fit/center keeps content visible. */
  padding?: { top: number; bottom: number };
}

function fitZone(map: MlMap, buffered: FenceGeometry, animate: boolean) {
  const [w, s, e, n] = bbox(feature(buffered) as GeoJSON.Feature<GeoJSON.Polygon>);
  map.fitBounds(
    [
      [w, s],
      [e, n],
    ],
    { padding: 24, animate, maxZoom: 18 },
  );
}

/** Full-screen match map: zone, my dot, fading ping accuracy circles, pulsing live markers. */
export default function MatchMap({ fence, buffered, myFix, pings = [], markers = [], padding }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map } = useMaplibre(containerRef);
  const top = padding?.top ?? 0;
  const bottom = padding?.bottom ?? 0;

  // Zone + initial fit.
  useEffect(() => {
    if (!map) return;
    ensureFenceLayers(map);
    if (!map.getLayer("pings-fill")) {
      setGeoJson(map, "pings", null);
      map.addLayer({
        id: "pings-fill",
        type: "fill",
        source: "pings",
        paint: { "fill-color": ["get", "color"], "fill-opacity": ["*", 0.3, ["get", "opacity"]] },
      });
      map.addLayer({
        id: "pings-line",
        type: "line",
        source: "pings",
        paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": ["get", "opacity"] },
      });
    }
    setGeoJson(map, "fence", feature(fence, { color: COLORS.hider }));
    setGeoJson(map, "fence-buffer", feature(buffered));
    fitZone(map, buffered, false);
  }, [map, fence, buffered]);

  useEffect(() => {
    map?.setPadding({ top, bottom, left: 0, right: 0 });
  }, [map, top, bottom]);

  // Ping accuracy circles: radius max(accuracy, 10 m); opacity by wave age (100/50/20 %).
  useEffect(() => {
    if (!map || !map.getSource("pings")) return;
    const features = [...pings]
      .sort((a, b) => b.rank - a.rank) // draw latest on top
      .filter((p) => p.rank < PING_HISTORY_OPACITY.length)
      .map((p) =>
        circle([p.lng, p.lat], Math.max(p.accuracy_m, PING_MIN_RENDER_RADIUS_M) / 1000, {
          steps: 48,
          units: "kilometers",
          properties: { opacity: PING_HISTORY_OPACITY[p.rank], color: p.stale ? COLORS.warn : COLORS.seeker },
        }),
      );
    setGeoJson(map, "pings", { type: "FeatureCollection", features });
  }, [map, pings]);

  // Name chips on the latest wave.
  const labelStore = useRef(new Map<string, { marker: Marker; sig: string }>());
  useEffect(() => {
    if (!map) return;
    const latest = pings
      .filter((p) => p.rank === 0)
      .map((p) => ({ ...p, id: `ping:${p.playerId}` }));
    syncMarkers(
      map,
      labelStore.current,
      latest,
      (p) => `${p.label}:${p.stale}`,
      (p) => labelElement(p.stale ? `${p.label} · stale` : p.label, p.stale ? COLORS.warn : COLORS.seeker),
    );
  }, [map, pings]);

  // Live pulsing markers.
  const liveStore = useRef(new Map<string, { marker: Marker; sig: string }>());
  useEffect(() => {
    if (!map) return;
    syncMarkers(
      map,
      liveStore.current,
      markers,
      (m) => `${m.kind}:${m.label}`,
      (m) => pulseElement(m.label, m.kind === "oob-hider" ? COLORS.warn : COLORS.seeker),
    );
  }, [map, markers]);

  // My dot.
  const meMarker = useRef<Marker | null>(null);
  useEffect(() => {
    if (!map || !myFix) return;
    meMarker.current ??= new Marker({ element: userDotElement() }).setLngLat([myFix.lng, myFix.lat]).addTo(map);
    meMarker.current.setLngLat([myFix.lng, myFix.lat]);
  }, [map, myFix]);

  useEffect(() => {
    if (!map) return;
    const labels = labelStore.current;
    const live = liveStore.current;
    return () => {
      for (const s of [labels, live]) {
        s.forEach((m) => m.marker.remove());
        s.clear();
      }
      meMarker.current?.remove();
      meMarker.current = null;
    };
  }, [map]);

  return (
    <div className="hs-fullscreen-map absolute inset-0">
      <div ref={containerRef} className="h-full w-full" data-testid="match-map" />
      <div className="absolute right-3 flex flex-col gap-2" style={{ top: top + 8 }}>
        <button
          type="button"
          aria-label="Center on me"
          disabled={!myFix}
          onClick={() => myFix && map?.easeTo({ center: [myFix.lng, myFix.lat], zoom: Math.max(map.getZoom(), 17) })}
          className="grid size-11 place-items-center rounded-full bg-black/80 ring-1 ring-neutral-700 backdrop-blur disabled:opacity-40"
        >
          <LocateFixed className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Show whole zone"
          onClick={() => map && fitZone(map, buffered, true)}
          className="grid size-11 place-items-center rounded-full bg-black/80 ring-1 ring-neutral-700 backdrop-blur"
        >
          <Maximize className="size-5" />
        </button>
      </div>
    </div>
  );
}
