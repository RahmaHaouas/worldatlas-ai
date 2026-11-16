// Local development helper: download Natural Earth boundaries to public/data so `npm run dev`
// works before the cloud pipeline has published them. (In production the SyncGeo Lambda does this.)
import { mkdir, writeFile } from "node:fs/promises";

const URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";
const res = await fetch(URL);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
const fc = await res.json();
const round = (c) => (typeof c[0] === "number" ? [+c[0].toFixed(3), +c[1].toFixed(3)] : c.map(round));
const features = fc.features
  .map((f) => {
    const p = f.properties;
    const iso3 = [p.ISO_A3_EH, p.ISO_A3, p.ADM0_A3].find((v) => v && v !== "-99");
    return iso3 && f.geometry
      ? { type: "Feature", properties: { iso3, name: p.NAME || p.ADMIN }, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } }
      : null;
  })
  .filter(Boolean);
await mkdir("public/data", { recursive: true });
await writeFile("public/data/countries.geojson", JSON.stringify({ type: "FeatureCollection", features }));
console.log(`Wrote ${features.length} countries to public/data/countries.geojson`);
