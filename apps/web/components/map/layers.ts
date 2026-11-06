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

export const COLORS = {
  hider: "#a3e635",
  seeker: "#fb7185",
  warn: "#fbbf24",
  white: "#ffffff",
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
    paint: { "fill-color": ["coalesce", ["get", "color"], COLORS.hider], "fill-opacity": 0.14 },
  });
  map.addLayer({
    id: `${prefix}-line`,
    type: "line",
    source: prefix,
    paint: { "line-color": ["coalesce", ["get", "color"], COLORS.hider], "line-width": 2.5 },
  });
  map.addLayer({
    id: `${prefix}-buffer-line`,
    type: "line",
    source: `${prefix}-buffer`,
    paint: { "line-color": COLORS.white, "line-width": 1, "line-opacity": 0.45, "line-dasharray": [2, 2] },
  });
}

export function feature(geometry: GeoJSON.Geometry | FenceGeometry, props: Record<string, unknown> = {}) {
  return { type: "Feature", properties: props, geometry } as GeoJSON.Feature;
}
