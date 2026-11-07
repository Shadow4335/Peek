"use client";

import { bbox, circle } from "@turf/turf";
import { PING_MIN_RENDER_RADIUS_M, type AdminRoomDetail } from "@hideseek/shared";
import { Maximize } from "lucide-react";
import { Marker, type Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { COLORS, ensureFenceLayers, feature, setGeoJson } from "@/components/map/layers";
import { dotLabelElement } from "@/components/map/markers";
import { syncMarkers } from "@/components/map/syncMarkers";
import { useMaplibre } from "@/components/map/useMaplibre";

export interface AdminMapPoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  color: string;
  ring?: string;
}

function fit(map: MlMap, detail: AdminRoomDetail, animate: boolean) {
  const [w, s, e, n] = bbox(feature(detail.room.geofence_buffered) as GeoJSON.Feature<GeoJSON.Polygon>);
  map.fitBounds(
    [
      [w, s],
      [e, n],
    ],
    { padding: 40, animate, maxZoom: 18 },
  );
}

/** Referee map: zone + every located player with an accuracy circle. */
export default function AdminMap({ detail, points }: { detail: AdminRoomDetail; points: AdminMapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map } = useMaplibre(containerRef);
  const roomId = detail.room.id;
  const fittedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!map) return;
    ensureFenceLayers(map);
    if (!map.getLayer("acc-fill")) {
      setGeoJson(map, "acc", null);
      map.addLayer({
        id: "acc-fill",
        type: "fill",
        source: "acc",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: "acc-line",
        type: "line",
        source: "acc",
        paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": 0.8 },
      });
    }
    setGeoJson(map, "fence", feature(detail.room.geofence, { color: COLORS.hider }));
    setGeoJson(map, "fence-buffer", feature(detail.room.geofence_buffered));
    if (fittedFor.current !== roomId) {
      fittedFor.current = roomId;
      fit(map, detail, false);
    }
  }, [map, detail, roomId]);

  useEffect(() => {
    if (!map || !map.getSource("acc")) return;
    setGeoJson(map, "acc", {
      type: "FeatureCollection",
      features: points.map((p) =>
        circle([p.lng, p.lat], Math.max(p.accuracy_m, PING_MIN_RENDER_RADIUS_M) / 1000, {
          steps: 40,
          units: "kilometers",
          properties: { color: p.color },
        }),
      ),
    });
  }, [map, points]);

  const store = useRef(new Map<string, { marker: Marker; sig: string }>());
  useEffect(() => {
    if (!map) return;
    syncMarkers(
      map,
      store.current,
      points,
      (p) => `${p.label}|${p.color}|${p.ring ?? ""}`,
      (p) => dotLabelElement(p.label, p.color, p.ring),
    );
  }, [map, points]);

  useEffect(() => {
    if (!map) return;
    const s = store.current;
    return () => {
      s.forEach((m) => m.marker.remove());
      s.clear();
    };
  }, [map]);

  return (
    <div className="hs-admin-map relative h-full min-h-80 overflow-hidden rounded-3xl ring-1 ring-neutral-800">
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" data-testid="admin-map" />
      </div>
      <button
        type="button"
        aria-label="Fit zone"
        onClick={() => map && fit(map, detail, true)}
        className="absolute top-3 right-3 grid size-12 place-items-center rounded-full bg-black/80 ring-1 ring-neutral-700"
      >
        <Maximize className="size-5" />
      </button>
    </div>
  );
}
