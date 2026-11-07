import { Marker, type Map as MlMap } from "maplibre-gl";

/** Keeps one DOM marker per item id; rebuilds a marker only when its signature changes. */
export function syncMarkers<T extends { id: string; lat: number; lng: number }>(
  map: MlMap,
  store: Map<string, { marker: Marker; sig: string }>,
  items: T[],
  sig: (t: T) => string,
  make: (t: T) => HTMLElement,
) {
  const seen = new Set<string>();
  for (const it of items) {
    seen.add(it.id);
    const existing = store.get(it.id);
    const s = sig(it);
    if (existing && existing.sig === s) {
      existing.marker.setLngLat([it.lng, it.lat]);
      continue;
    }
    existing?.marker.remove();
    store.set(it.id, { marker: new Marker({ element: make(it) }).setLngLat([it.lng, it.lat]).addTo(map), sig: s });
  }
  for (const [id, m] of store) {
    if (!seen.has(id)) {
      m.marker.remove();
      store.delete(id);
    }
  }
}
