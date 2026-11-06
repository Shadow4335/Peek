// MapLibre v6 loads its Web Worker relative to import.meta.url, which bundlers rewrite.
// Serve the worker as a static file instead; useMaplibre() calls setWorkerUrl() with this path.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("maplibre-gl/package.json"));
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "vendor");
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
// Versioned filename so it can be cached immutably (see vercel.json).
const name = `maplibre-gl-worker-${version}.mjs`;
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.startsWith("maplibre-gl-worker")) rmSync(join(outDir, f));
copyFileSync(join(pkgDir, "dist", "maplibre-gl-worker.mjs"), join(outDir, name));
console.log(`[copy-maplibre-worker] public/vendor/${name}`);
