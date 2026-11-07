"use client";

import { bbox, circle } from "@turf/turf";
import { PING_MIN_RENDER_RADIUS_M, type FenceGeometry, type PingWaveEvent, type PolygonGeometry } from "@hideseek/shared";
import { Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { COLORS, ensureFenceLayers, feature, setGeoJson } from "@/components/map/layers";
import { initialOf, pingMarkerElement } from "@/components/map/markers";
import { useMaplibre } from "@/components/map/useMaplibre";

interface Props {
  fence: PolygonGeometry;
  buffered: FenceGeometry;
  /** Oldest first. */
  waves: PingWaveEvent[];
  /** Index into `waves` currently shown. */
  step: number;
  colorOf: (playerId: string) => string;
  nameOf: (playerId: string) => string;
}

/** Post-match replay: each hider's trail up to `step`, with accuracy circles for that wave. */
export default function ReplayMap({ fence, buffered, waves, step, colorOf, nameOf }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map } = useMaplibre(containerRef);

  useEffect(() => {
    if (!map) return;
    ensureFenceLayers(map);
    setGeoJson(map, "fence", feature(fence, { color: COLORS.zone }));
    setGeoJson(map, "fence-buffer", feature(buffered));
    if (!map.getLayer("trails")) {
      setGeoJson(map, "trails", null);
      setGeoJson(map, "replay-pings", null);
      map.addLayer({
        id: "trails",
        type: "line",
        source: "trails",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 3, "line-opacity": 0.8 },
      });
      map.addLayer({
        id: "replay-fill",
        type: "fill",
        source: "replay-pings",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "replay-line",
        type: "line",
        source: "replay-pings",
        paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-dasharray": [3, 2] },
      });
    }
    const [w, s, e, n] = bbox(feature(buffered) as GeoJSON.Feature<GeoJSON.Polygon>);
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 24, animate: false },
    );
  }, [map, fence, buffered]);

  const labels = useRef(new Map<string, Marker>());
  useEffect(() => {
    if (!map || !map.getSource("trails")) return;
    const shown = waves.slice(0, step + 1);
    const paths = new Map<string, [number, number][]>();
    for (const w of shown) {
      for (const p of w.pings) {
        const path = paths.get(p.playerId) ?? [];
        path.push([p.lng, p.lat]);
        paths.set(p.playerId, path);
      }
    }
    setGeoJson(map, "trails", {
      type: "FeatureCollection",
      features: [...paths]
        .filter(([, coords]) => coords.length > 1)
        .map(([id, coords]) => feature({ type: "LineString", coordinates: coords }, { color: colorOf(id) })),
    });
    const current = waves[step]?.pings ?? [];
    setGeoJson(map, "replay-pings", {
      type: "FeatureCollection",
      features: current.map((p) =>
        circle([p.lng, p.lat], Math.max(p.accuracy_m, PING_MIN_RENDER_RADIUS_M) / 1000, {
          steps: 40,
          units: "kilometers",
          properties: { color: colorOf(p.playerId) },
        }),
      ),
    });

    const store = labels.current;
    const seen = new Set<string>();
    for (const p of current) {
      seen.add(p.playerId);
      const existing = store.get(p.playerId);
      if (existing) existing.setLngLat([p.lng, p.lat]);
      else
        store.set(
          p.playerId,
          new Marker({
            element: pingMarkerElement({
              initial: initialOf(nameOf(p.playerId)),
              title: nameOf(p.playerId),
              detail: "",
              state: "muted",
              color: colorOf(p.playerId),
            }).root,
          })
            .setLngLat([p.lng, p.lat])
            .addTo(map),
        );
    }
    for (const [id, m] of store) {
      if (!seen.has(id)) {
        m.remove();
        store.delete(id);
      }
    }
  }, [map, waves, step, colorOf, nameOf]);

  useEffect(() => {
    if (!map) return;
    const store = labels.current;
    return () => {
      store.forEach((m) => m.remove());
      store.clear();
    };
  }, [map]);

  return (
    <div className="relative h-72 overflow-hidden rounded-card ring-1 ring-line">
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" data-testid="replay-map" />
      </div>
    </div>
  );
}
