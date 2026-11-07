"use client";

import { bbox, circle } from "@turf/turf";
import {
  PING_HISTORY_OPACITY,
  PING_MIN_RENDER_RADIUS_M,
  type FenceGeometry,
  type GeoFix,
  type PolygonGeometry,
} from "@hideseek/shared";
import { LocateFixed, Maximize } from "lucide-react";
import { Marker, type Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { COLORS, ensureFenceLayers, feature, setGeoJson } from "@/components/map/layers";
import { initialOf, pingMarkerElement, userDotElement, type PingMarkerHandle, type PingMarkerState } from "@/components/map/markers";
import { useMaplibre } from "@/components/map/useMaplibre";
import { FRESH_PING_MS, formatAgo } from "@/lib/useNow";

export interface PingDot {
  playerId: string;
  label: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  /** GPS fix was already old when the wave fired. */
  stale: boolean;
  /** 0 = latest wave, 1 = N-1, 2 = N-2. */
  rank: number;
  wave: number;
  /** When the position was captured (heartbeat time), not when the ping arrived. */
  capturedAt: string;
}

export interface LiveMarker {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: "oob-hider" | "exposed-seeker";
  /** Capture time of the shown position, when known. */
  at?: string;
  /** Extra text, e.g. exposure countdown. */
  note?: string;
}

interface Props {
  fence: PolygonGeometry;
  buffered: FenceGeometry;
  myFix: GeoFix | null;
  pings?: PingDot[];
  markers?: LiveMarker[];
  now: number;
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

interface PinEntry {
  marker: Marker;
  handle: PingMarkerHandle;
  key: string;
}

/**
 * Keeps one pin per id. A pin is rebuilt (and plays its arrival animation) only when
 * `key` changes, e.g. a new ping wave; otherwise its label/state update in place so
 * the per-second "x s ago" refresh never re-triggers motion.
 */
function syncPins<T extends { id: string; lat: number; lng: number }>(
  map: MlMap,
  store: Map<string, PinEntry>,
  items: T[],
  view: (t: T) => { key: string; initial: string; title: string; detail: string; state: PingMarkerState; ring?: string },
  animateNew: boolean,
) {
  const seen = new Set<string>();
  for (const it of items) {
    seen.add(it.id);
    const v = view(it);
    const cur = store.get(it.id);
    if (cur && cur.key === v.key) {
      cur.marker.setLngLat([it.lng, it.lat]);
      cur.handle.update(v);
      continue;
    }
    cur?.marker.remove();
    const handle = pingMarkerElement({ ...v, arrive: animateNew, ringColor: v.ring });
    const marker = new Marker({ element: handle.root, anchor: "center" }).setLngLat([it.lng, it.lat]).addTo(map);
    store.set(it.id, { marker, handle, key: v.key });
  }
  for (const [id, e] of store) {
    if (!seen.has(id)) {
      e.marker.remove();
      store.delete(id);
    }
  }
}

/**
 * Full-screen hunt map. Shows the play zone, your position (lavender), and only the
 * snapshots the server sent this player: latest wave as labelled pins (sage = fresh,
 * coral = aged) plus real GPS-accuracy circles for the last three waves (100/50/20 %).
 */
export default function MatchMap({ fence, buffered, myFix, pings = [], markers = [], now, padding }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map } = useMaplibre(containerRef);
  const top = padding?.top ?? 0;
  const bottom = padding?.bottom ?? 0;

  // Zone + accuracy layers + initial fit.
  useEffect(() => {
    if (!map) return;
    ensureFenceLayers(map);
    if (!map.getLayer("pings-fill")) {
      setGeoJson(map, "pings", null);
      map.addLayer({
        id: "pings-fill",
        type: "fill",
        source: "pings",
        paint: { "fill-color": ["get", "color"], "fill-opacity": ["*", 0.18, ["get", "opacity"]] },
      });
      map.addLayer({
        id: "pings-line",
        type: "line",
        source: "pings",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1.5,
          "line-opacity": ["*", 0.8, ["get", "opacity"]],
          "line-dasharray": [3, 2],
        },
      });
    }
    setGeoJson(map, "fence", feature(fence, { color: COLORS.zone }));
    setGeoJson(map, "fence-buffer", feature(buffered));
    fitZone(map, buffered, false);
  }, [map, fence, buffered]);

  useEffect(() => {
    map?.setPadding({ top, bottom, left: 0, right: 0 });
  }, [map, top, bottom]);

  // GPS accuracy circles (real data): radius max(accuracy, 10 m), opacity by wave age.
  useEffect(() => {
    if (!map || !map.getSource("pings")) return;
    const features = [...pings]
      .sort((a, b) => b.rank - a.rank) // draw latest on top
      .filter((p) => p.rank < PING_HISTORY_OPACITY.length)
      .map((p) =>
        circle([p.lng, p.lat], Math.max(p.accuracy_m, PING_MIN_RENDER_RADIUS_M) / 1000, {
          steps: 48,
          units: "kilometers",
          properties: {
            opacity: PING_HISTORY_OPACITY[p.rank],
            color: p.rank === 0 && !p.stale ? COLORS.fresh : COLORS.stale,
          },
        }),
      );
    setGeoJson(map, "pings", { type: "FeatureCollection", features });
  }, [map, pings]);

  // Latest-wave snapshot pins with name + capture-age label.
  const pinStore = useRef(new Map<string, PinEntry>());
  const seededPins = useRef(false);
  useEffect(() => {
    if (!map) return;
    const latest = pings.filter((p) => p.rank === 0).map((p) => ({ ...p, id: `ping:${p.playerId}` }));
    syncPins(
      map,
      pinStore.current,
      latest,
      (p) => {
        const age = now - Date.parse(p.capturedAt);
        const aged = p.stale || !(age < FRESH_PING_MS);
        return {
          key: `${p.wave}`,
          initial: initialOf(p.label),
          title: p.label,
          detail: `${aged ? "last seen " : ""}${formatAgo(p.capturedAt, now)}${p.stale ? " · old GPS" : ""}`,
          state: aged ? "aged" : "fresh",
        };
      },
      seededPins.current, // history loaded on mount appears without fanfare
    );
    if (latest.length) seededPins.current = true;
  }, [map, pings, now]);

  // Penalty markers: out-of-bounds hider (amber) / exposed seeker (lavender).
  const liveStore = useRef(new Map<string, PinEntry>());
  useEffect(() => {
    if (!map) return;
    syncPins(
      map,
      liveStore.current,
      markers,
      (m) => ({
        key: m.kind,
        initial: initialOf(m.label),
        title: m.label,
        detail: [m.note, m.at ? formatAgo(m.at, now) : null].filter(Boolean).join(" · "),
        state: m.kind === "oob-hider" ? "alert" : "seeker",
        ring: m.kind === "oob-hider" ? COLORS.alert : COLORS.seeker,
      }),
      true,
    );
  }, [map, markers, now]);

  // You.
  const meMarker = useRef<Marker | null>(null);
  useEffect(() => {
    if (!map || !myFix) return;
    meMarker.current ??= new Marker({ element: userDotElement() }).setLngLat([myFix.lng, myFix.lat]).addTo(map);
    meMarker.current.setLngLat([myFix.lng, myFix.lat]);
  }, [map, myFix]);

  useEffect(() => {
    if (!map) return;
    const pinsNow = pinStore.current;
    const live = liveStore.current;
    return () => {
      for (const s of [pinsNow, live]) {
        s.forEach((e) => e.marker.remove());
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
          className="grid size-11 place-items-center rounded-full bg-surface/90 text-ink ring-1 ring-line backdrop-blur transition-transform active:scale-[.97] disabled:opacity-40"
        >
          <LocateFixed className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Show whole zone"
          onClick={() => map && fitZone(map, buffered, true)}
          className="grid size-11 place-items-center rounded-full bg-surface/90 text-ink ring-1 ring-line backdrop-blur transition-transform active:scale-[.97]"
        >
          <Maximize className="size-5" />
        </button>
      </div>
    </div>
  );
}
