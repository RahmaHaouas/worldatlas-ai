"use client";
import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";

type Geometry = { type: string; coordinates: unknown };
interface Feature {
  type: "Feature";
  properties: { iso3: string; name: string };
  geometry: Geometry;
}
interface FeatureCollection {
  type: "FeatureCollection";
  features: Feature[];
}

export interface MapMarker {
  iso3: string;
  name: string;
  lat: number;
  lon: number;
}

export interface WorldMapProps {
  /** normalised 0..1 intensity per ISO3 for the current visualisation mode */
  values: Record<string, number>;
  color: string;
  highlight: string[] | null;
  highlightColor?: string;
  selected: string | null;
  compare: string[];
  markers: MapMarker[];
  projection: "globe" | "mercator";
  describe: (iso3: string, name: string) => string;
  onSelect: (iso3: string, name: string) => void;
  focus?: { lat: number; lon: number } | null;
}

const PRIMARY_URL = process.env.NEXT_PUBLIC_GEOJSON_URL || "/data/countries.geojson";
const FALLBACK_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "ocean", type: "background", paint: { "background-color": "#071426" } }],
};

function normalise(fc: { features: { properties: Record<string, string>; geometry: Geometry | null }[] }): FeatureCollection {
  const features: Feature[] = [];
  for (const f of fc.features) {
    const p = f.properties || {};
    const iso3 = p.iso3 || [p.ISO_A3_EH, p.ISO_A3, p.ADM0_A3].find((v) => v && v !== "-99");
    if (!iso3 || !f.geometry) continue;
    features.push({ type: "Feature", properties: { iso3, name: p.name || p.NAME || p.ADMIN || iso3 }, geometry: f.geometry });
  }
  return { type: "FeatureCollection", features };
}

async function loadGeo(): Promise<FeatureCollection> {
  for (const url of [PRIMARY_URL, FALLBACK_URL]) {
    try {
      const r = await fetch(url);
      if (r.ok) return normalise(await r.json());
    } catch {
      /* try next */
    }
  }
  throw new Error("Unable to load world boundaries");
}

function bbox(geom: Geometry): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(geom.coordinates);
  return [minX, minY, maxX, maxY];
}

function fillExpression(color: string, highlightColor: string): ExpressionSpecification {
  const value = ["coalesce", ["feature-state", "value"], 0];
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false], "#f59e0b",
    ["boolean", ["feature-state", "highlight"], false], highlightColor,
    [">", value, 0], ["interpolate", ["linear"], value, 0, "#1b3150", 1, color],
    "#13243d",
  ] as unknown as ExpressionSpecification;
}

export default function WorldMap(props: WorldMapProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const tooltip = useRef<HTMLDivElement | null>(null);
  const features = useRef<Record<string, { name: string; bbox: [number, number, number, number] }>>({});
  const propsRef = useRef(props);
  propsRef.current = props;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------- create the map once
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style: BASE_STYLE,
      center: [15, 25],
      zoom: 1.6,
      minZoom: 0.8,
      maxZoom: 8,
      attributionControl: { compact: true, customAttribution: "Boundaries: Natural Earth" },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: false }), "bottom-right");
    let hovered: string | null = null;

    map.on("load", async () => {
      try {
        const fc = await loadGeo();
        fc.features.forEach((f) => {
          features.current[f.properties.iso3] = { name: f.properties.name, bbox: bbox(f.geometry) };
        });
        map.addSource("countries", { type: "geojson", data: fc as unknown as GeoJSON.FeatureCollection, promoteId: "iso3" });
        map.addSource("markers", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "country-fill",
          type: "fill",
          source: "countries",
          paint: {
            "fill-color": fillExpression(propsRef.current.color, propsRef.current.highlightColor || "#38bdf8"),
            "fill-opacity": ["case", ["boolean", ["feature-state", "dim"], false], 0.35, 0.92] as unknown as ExpressionSpecification,
          },
        });
        map.addLayer({ id: "country-border", type: "line", source: "countries",
          paint: { "line-color": "#0b1a2e", "line-width": 0.6 } });
        map.addLayer({ id: "country-compare", type: "line", source: "countries",
          paint: { "line-color": "#f59e0b", "line-width": ["case", ["boolean", ["feature-state", "compare"], false], 2.2, 0] as unknown as ExpressionSpecification } });
        map.addLayer({ id: "country-hover", type: "line", source: "countries",
          paint: { "line-color": "#e2e8f0", "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.6, 0] as unknown as ExpressionSpecification } });
        map.addLayer({ id: "markers", type: "circle", source: "markers",
          paint: { "circle-radius": 5, "circle-color": "#f8fafc", "circle-stroke-color": "#0ea5e9", "circle-stroke-width": 2.5, "circle-opacity": 0.95 } });
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Map data unavailable");
      }
    });

    map.on("style.load", () => {
      try {
        map.setProjection({ type: propsRef.current.projection });
      } catch {
        /* projection not supported: stay in mercator */
      }
    });

    map.on("mousemove", "country-fill", (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const iso3 = String(f.properties?.iso3);
      if (hovered !== iso3) {
        if (hovered) map.setFeatureState({ source: "countries", id: hovered }, { hover: false });
        hovered = iso3;
        map.setFeatureState({ source: "countries", id: iso3 }, { hover: true });
      }
      map.getCanvas().style.cursor = "pointer";
      if (tooltip.current) {
        tooltip.current.style.display = "block";
        tooltip.current.style.left = `${e.point.x + 14}px`;
        tooltip.current.style.top = `${e.point.y + 14}px`;
        tooltip.current.innerText = propsRef.current.describe(iso3, String(f.properties?.name));
      }
    });
    map.on("mouseleave", "country-fill", () => {
      if (hovered) map.setFeatureState({ source: "countries", id: hovered }, { hover: false });
      hovered = null;
      map.getCanvas().style.cursor = "";
      if (tooltip.current) tooltip.current.style.display = "none";
    });
    map.on("click", "country-fill", (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (f) propsRef.current.onSelect(String(f.properties?.iso3), String(f.properties?.name));
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ---------- data-driven styling
  const { values, color, highlight, highlightColor, selected, compare, markers, projection } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setPaintProperty("country-fill", "fill-color", fillExpression(color, highlightColor || "#38bdf8"));
    const hl = highlight ? new Set(highlight) : null;
    const cmp = new Set(compare);
    for (const iso3 of Object.keys(features.current)) {
      map.setFeatureState(
        { source: "countries", id: iso3 },
        {
          value: values[iso3] ?? 0,
          highlight: hl ? hl.has(iso3) : false,
          dim: hl ? !hl.has(iso3) && iso3 !== selected : false,
          selected: iso3 === selected,
          compare: cmp.has(iso3),
        },
      );
    }
  }, [ready, values, color, highlight, highlightColor, selected, compare]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("markers") as GeoJSONSource | undefined;
    const data = {
      type: "FeatureCollection",
      features: markers.map((m) => ({
        type: "Feature",
        properties: { iso3: m.iso3, name: m.name },
        geometry: { type: "Point", coordinates: [m.lon, m.lat] },
      })),
    } as unknown as GeoJSON.FeatureCollection;
    src?.setData(data);
  }, [ready, markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    try {
      map.setProjection({ type: projection });
    } catch {
      /* ignore */
    }
  }, [ready, projection]);

  // ---------- camera: fly to the selected country
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selected) return;
    const f = features.current[selected];
    const wide = typeof window !== "undefined" && window.innerWidth >= 1024;
    const padding = { top: 90, bottom: wide ? 110 : 320, left: wide ? 380 : 30, right: wide ? 460 : 30 };
    if (f && f.bbox[2] - f.bbox[0] < 180) {
      map.fitBounds([[f.bbox[0], f.bbox[1]], [f.bbox[2], f.bbox[3]]], { padding, maxZoom: 5, duration: 1400 });
    } else if (props.focus) {
      map.flyTo({ center: [props.focus.lon, props.focus.lat], zoom: 2.5, duration: 1400 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selected]);

  return (
    <div className="absolute inset-0">
      <div ref={container} className="absolute inset-0" aria-label="Interactive world map" role="application" />
      <div
        ref={tooltip}
        className="pointer-events-none absolute z-20 hidden max-w-xs rounded-lg bg-ink-900/95 px-3 py-2 text-xs text-slate-100 shadow-panel ring-1 ring-white/10 whitespace-pre-line"
      />
      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex items-center gap-3 rounded-xl bg-ink-900/80 px-4 py-3 text-sm text-slate-300 ring-1 ring-white/10">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            Loading world map…
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="rounded-xl bg-red-950/80 px-4 py-3 text-sm text-red-200 ring-1 ring-red-500/30">{error}</div>
        </div>
      )}
    </div>
  );
}
