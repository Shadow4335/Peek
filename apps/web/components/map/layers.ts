import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { FenceGeometry } from "@hideseek/shared";

type Geo = GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection;
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Creates or updates a GeoJSON source. Pass null to clear it. */
export function setGeoJson(map: MlMap, id: string, data: Geo | FenceGeometry | null) {
  const value = (data ?? EMPTY) as GeoJSON.GeoJSON;
  const src = map.getSource(id) as GeoJSONSource | undefined;
  if (src) src.setData(value);
  else map.addSource(id, { type: "geojson", data: value });
}

/**
 * Brand colours for map layers and markers (mirrors the --peek-* CSS tokens; MapLibre
 * paint properties can't read CSS variables).
 */
export const COLORS = {
  // Map palette
  mapBg: "#242831",
  mapRoad: "#343a43",
  mapRoadSecondary: "#383e48",
  mapBuilding: "#2b303a",
  mapPark: "#2f4138",
  mapWater: "#2b3540",
  mapLabel: "#a4aab5",
  mapPanel: "#202129",
  // Semantics
  zone: "#b6cd91", // play zone outline (sage)
  zoneBroken: "#dc8d90", // invalid shape while drawing
  you: "#8878cb", // local player
  fresh: "#b6cd91", // newly received ping
  stale: "#c58f87", // aged snapshot (always paired with a time label)
  alert: "#d9bc81", // incoming ping / penalty attention
  hider: "#c58f87",
  seeker: "#8878cb",
  neutral: "#858593",
  text: "#f0eee9",
} as const;

/** Play-zone fill + outline + dashed drift-buffer outline. */
export function ensureFenceLayers(map: MlMap, prefix = "fence") {
  if (map.getLayer(`${prefix}-fill`)) return;
  setGeoJson(map, prefix, null);
  setGeoJson(map, `${prefix}-buffer`, null);
  map.addLayer({
    id: `${prefix}-fill`,
    type: "fill",
    source: prefix,
    paint: { "fill-color": ["coalesce", ["get", "color"], COLORS.zone], "fill-opacity": 0.08 },
  });
  map.addLayer({
    id: `${prefix}-line`,
    type: "line",
    source: prefix,
    paint: { "line-color": ["coalesce", ["get", "color"], COLORS.zone], "line-width": 2.5, "line-opacity": 0.9 },
  });
  map.addLayer({
    id: `${prefix}-buffer-line`,
    type: "line",
    source: `${prefix}-buffer`,
    paint: { "line-color": COLORS.text, "line-width": 1, "line-opacity": 0.35, "line-dasharray": [2, 2] },
  });
}

export function feature(geometry: GeoJSON.Geometry | FenceGeometry, props: Record<string, unknown> = {}) {
  return { type: "Feature", properties: props, geometry } as GeoJSON.Feature;
}
