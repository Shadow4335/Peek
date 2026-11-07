import type { Map as MlMap } from "maplibre-gl";
import { COLORS } from "./layers";

/**
 * Recolours whatever OpenMapTiles-schema style is loaded (OpenFreeMap dark by default,
 * liberty/positron also work) into the understated peek! night palette, by layer type
 * and source-layer. Purely visual: no data, interaction or camera changes.
 */
export function applyPeekMapTheme(map: MlMap) {
  const style = map.getStyle();
  if (!style?.layers) return;
  type PaintProp = Parameters<MlMap["setPaintProperty"]>[1];
  const set = (id: string, prop: string, value: string | number) => {
    try {
      map.setPaintProperty(id, prop as PaintProp, value);
    } catch {
      /* property not applicable to this layer */
    }
  };

  for (const layer of style.layers) {
    const id = layer.id;
    const src = "source-layer" in layer ? (layer["source-layer"] as string | undefined) : undefined;
    const name = `${id} ${src ?? ""}`;

    switch (layer.type) {
      case "background":
        set(id, "background-color", COLORS.mapBg);
        break;
      case "fill":
        if (src === "water") set(id, "fill-color", COLORS.mapWater);
        else if (src === "building") {
          set(id, "fill-color", COLORS.mapBuilding);
          set(id, "fill-outline-color", COLORS.mapRoad);
        } else if (/park|wood|grass|forest|scrub|wetland/.test(name)) set(id, "fill-color", COLORS.mapPark);
        else if (/ice|glacier/.test(name)) set(id, "fill-color", COLORS.mapRoadSecondary);
        else if (src === "landuse" || src === "landcover") set(id, "fill-color", "#272b34");
        else if (src === "transportation" || src === "aeroway") set(id, "fill-color", COLORS.mapRoad);
        break;
      case "fill-extrusion":
        set(id, "fill-extrusion-color", COLORS.mapBuilding);
        break;
      case "line":
        if (src === "waterway") set(id, "line-color", COLORS.mapWater);
        else if (src === "boundary") set(id, "line-color", "#4a4f5a");
        else if (/casing/.test(id)) set(id, "line-color", "#1e2128");
        else if (src === "transportation" || src === "aeroway") {
          set(id, "line-color", /path|minor|service|track|pier|subtle/.test(id) ? COLORS.mapRoadSecondary : COLORS.mapRoad);
        }
        break;
      case "symbol":
        set(id, "text-color", COLORS.mapLabel);
        set(id, "text-halo-color", "#1b1e25");
        set(id, "text-halo-width", 1.2);
        set(id, "icon-opacity", 0.55);
        break;
      default:
        break;
    }
  }
}
