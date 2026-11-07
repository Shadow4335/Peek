"use client";

import { bbox } from "@turf/turf";
import type { FenceGeometry, PolygonGeometry } from "@hideseek/shared";
import { Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { COLORS, ensureFenceLayers, feature, setGeoJson } from "@/components/map/layers";
import { userDotElement } from "@/components/map/markers";
import { useMaplibre } from "@/components/map/useMaplibre";
import type { TimedFix } from "@/lib/useGeolocation";

interface Props {
  fence: PolygonGeometry;
  buffered: FenceGeometry;
  fix: TimedFix | null;
  inside: boolean;
}

/** Static preview of the play zone with the player's live dot. */
export default function ZoneMiniMap({ fence, buffered, fix, inside }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map } = useMaplibre(containerRef, { interactive: false });

  useEffect(() => {
    if (!map) return;
    ensureFenceLayers(map);
    setGeoJson(map, "fence", feature(fence, { color: COLORS.zone }));
    setGeoJson(map, "fence-buffer", feature(buffered));
    const [w, s, e, n] = bbox(feature(buffered) as GeoJSON.Feature<GeoJSON.Polygon>);
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 20, animate: false },
    );
  }, [map, fence, buffered]);

  const dot = useRef<Marker | null>(null);
  useEffect(() => {
    if (!map || !fix) return;
    dot.current ??= new Marker({ element: userDotElement() }).setLngLat([fix.lng, fix.lat]).addTo(map);
    dot.current.setLngLat([fix.lng, fix.lat]);
    // Lavender inside; muted red ring + the GPS badge's text say when you're outside.
    dot.current.getElement().classList.toggle("peek-you--warn", !inside);
  }, [map, fix, inside]);

  useEffect(() => {
    return () => {
      dot.current?.remove();
      dot.current = null;
    };
  }, [map]);

  return (
    <div className="relative h-40 overflow-hidden rounded-card ring-1 ring-line">
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" data-testid="zone-mini-map" />
      </div>
    </div>
  );
}
