"use client";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { CATEGORY_META, fmtUsd } from "@/lib/format";
import type { CategoryId, CountrySummary, MapMode, ProductTrade, View } from "@/lib/types";
import TopNav from "@/components/TopNav";
import ModeBar from "@/components/ModeBar";
import AnalyticsBar from "@/components/AnalyticsBar";
import CountryPanel from "@/components/CountryPanel";
import SpecialtyExplorer from "@/components/SpecialtyExplorer";
import ComparePanel from "@/components/ComparePanel";
import TradePanel from "@/components/TradePanel";
import AssistantPanel, { type AssistantMessage } from "@/components/AssistantPanel";
import { ErrorBox } from "@/components/ui";

// MapLibre touches `window`, so the map is client-only.
const WorldMap = dynamic(() => import("@/components/WorldMap"), { ssr: false });

const MODE_COLOR: Record<string, string> = { countries: "#38bdf8", trade: "#a78bfa" };

export default function Home() {
  const countriesQ = useAsync(() => api.countries(), "countries");
  const countries = useMemo(() => countriesQ.data || [], [countriesQ.data]);
  const byIso = useMemo(() => Object.fromEntries(countries.map((c) => [c.iso3, c])) as Record<string, CountrySummary>, [countries]);

  const [view, setViewRaw] = useState<View>("explore");
  const [mode, setModeRaw] = useState<MapMode>("countries");
  const [projection, setProjection] = useState<"globe" | "mercator">("globe");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | undefined>();
  const [highlight, setHighlightState] = useState<{ iso3s: string[]; label: string } | null>(null);
  const [compareList, setCompareList] = useState<string[]>([]);
  const [specialtyId, setSpecialtyId] = useState<string | null>(null);
  const [tradeHs, setTradeHs] = useState<string | null>(null);
  const [tradeData, setTradeData] = useState<ProductTrade | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);

  const setView = useCallback((v: View) => {
    setViewRaw(v);
    if (v === "trade") setModeRaw("trade");
    else setModeRaw((m) => (m === "trade" ? "countries" : m));
    if (v !== "assistant" && v !== "specialties") setHighlightState(null);
  }, []);
  const setMode = useCallback((m: MapMode) => {
    setModeRaw(m);
    if (m === "trade") setViewRaw("trade");
  }, []);
  const setHighlight = useCallback((iso3s: string[] | null, label?: string) => {
    setHighlightState(iso3s && iso3s.length ? { iso3s, label: label || "selection" } : null);
  }, []);
  const selectCountry = useCallback((iso3: string, name?: string) => {
    setSelected(iso3);
    setSelectedName(name);
  }, []);
  const toggleCompare = useCallback((iso3: string) => {
    setCompareList((l) => (l.includes(iso3) ? l.filter((x) => x !== iso3) : [...l, iso3].slice(-5)));
  }, []);
  const askAI = useCallback((q: string) => {
    setPendingQuestion(q);
    setViewRaw("assistant");
  }, []);
  const openSpecialty = useCallback((id: string | null) => {
    setSpecialtyId(id);
    setViewRaw("specialties");
  }, []);

  // ---------- map colouring for the current mode
  const { values, color, legend } = useMemo(() => {
    const vals: Record<string, number> = {};
    if (mode === "trade") {
      const rows = tradeData?.world.status === "ok" ? tradeData.rows : [];
      const maxLog = Math.log10(Math.max(2, ...rows.map((r) => r.rca)));
      rows.forEach((r) => {
        vals[r.iso3] = r.rca > 1 ? 0.3 + 0.7 * Math.min(1, Math.log10(r.rca) / maxLog) : 0.08;
      });
      return { values: vals, color: MODE_COLOR.trade,
        legend: { color: MODE_COLOR.trade, label: `RCA · ${tradeData?.world.name || "select a product"}`, low: "≤1", high: "high" } };
    }
    const count = (c: CountrySummary) =>
      mode === "countries"
        ? Object.values(c.specialty_counts || {}).reduce((a: number, b) => a + (b || 0), 0)
        : c.specialty_counts?.[mode as CategoryId] || 0;
    const max = Math.max(1, ...countries.map(count));
    countries.forEach((c) => {
      const n = count(c);
      if (n > 0) vals[c.iso3] = 0.25 + 0.75 * (n / max);
    });
    const col = mode === "countries" ? MODE_COLOR.countries : CATEGORY_META[mode as CategoryId].color;
    return { values: vals, color: col,
      legend: { color: col, label: mode === "countries" ? "Recorded specialties" : CATEGORY_META[mode as CategoryId].label, low: "few", high: "many" } };
  }, [mode, countries, tradeData]);

  const describe = useCallback((iso3: string, name: string) => {
    const c = byIso[iso3];
    if (mode === "trade" && tradeData) {
      const r = tradeData.rows.find((x) => x.iso3 === iso3);
      return r ? `${c?.name || name}\n${tradeData.world.name} ${tradeData.year}: ${fmtUsd(r.export_value)} · RCA ${r.rca.toFixed(2)}` : `${c?.name || name}\nNo reported exports`;
    }
    const counts = c?.specialty_counts || {};
    const n = mode === "countries" ? Object.values(counts).reduce((a: number, b) => a + (b || 0), 0) : counts[mode as CategoryId] || 0;
    return `${c?.name || name}\n${n} specialty record${n === 1 ? "" : "s"}${mode === "countries" ? "" : ` · ${CATEGORY_META[mode as CategoryId].short}`}`;
  }, [byIso, mode, tradeData]);

  const markers = useMemo(() => (highlight?.iso3s || [])
    .map((iso3) => byIso[iso3])
    .filter((c): c is CountrySummary => !!c && c.latitude != null && c.longitude != null)
    .map((c) => ({ iso3: c.iso3, name: c.name, lat: c.latitude as number, lon: c.longitude as number })), [highlight, byIso]);

  const focus = selected && byIso[selected]?.latitude != null
    ? { lat: byIso[selected].latitude as number, lon: byIso[selected].longitude as number } : null;

  const mapHighlight = view === "compare" && compareList.length ? compareList : highlight?.iso3s || null;

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-ink-950 text-slate-100">
      <TopNav view={view} setView={setView} countries={countries}
        onPickCountry={(iso3) => selectCountry(iso3)} onPickSpecialty={(id) => openSpecialty(id)} />

      <div className="relative flex-1 bg-[radial-gradient(ellipse_at_center,_#0f2340_0%,_#050b16_70%)]">
        <WorldMap values={values} color={color} highlight={mapHighlight}
          highlightColor={view === "compare" ? "#f59e0b" : "#38bdf8"}
          selected={selected} compare={compareList} markers={markers} projection={projection}
          describe={describe} onSelect={selectCountry} focus={focus} />

        <div className={`pointer-events-none absolute left-2 right-2 top-2 z-10 flex justify-center sm:left-3 sm:right-3 ${view !== "explore" ? "lg:left-[420px]" : ""} ${selected ? "lg:right-[460px]" : ""}`}>
          <ModeBar mode={mode} setMode={setMode} projection={projection} setProjection={setProjection} />
        </div>

        {countriesQ.error && (
          <div className="absolute left-1/2 top-16 z-20 w-[min(92vw,520px)] -translate-x-1/2">
            <ErrorBox message={`${countriesQ.error} — the map still works; deploy the API and run the data pipeline to load country data.`} onRetry={countriesQ.reload} />
          </div>
        )}

        {view !== "explore" && (
          <aside className={`absolute inset-x-2 bottom-2 z-20 h-[58dvh] flex-col overflow-hidden rounded-2xl bg-ink-900/90 shadow-panel ring-1 ring-white/10 backdrop-blur-xl lg:inset-x-auto lg:bottom-3 lg:left-3 lg:top-16 lg:h-auto lg:w-[400px] ${selected ? "hidden lg:flex" : "flex"}`}>
            {view === "specialties" && (
              <SpecialtyExplorer specialtyId={specialtyId} onOpen={setSpecialtyId} countries={byIso} onHighlight={setHighlight}
                onSelectCountry={(iso3) => selectCountry(iso3)} onCompare={(l) => { setCompareList(l); setView("compare"); }} onAsk={askAI} />
            )}
            {view === "compare" && (
              <ComparePanel selection={compareList} setSelection={setCompareList} countries={countries} onSelectCountry={(iso3) => selectCountry(iso3)} />
            )}
            {view === "trade" && (
              <TradePanel hs={tradeHs} setHs={setTradeHs} countries={byIso} onData={setTradeData} onSelectCountry={(iso3) => selectCountry(iso3)} />
            )}
            {view === "assistant" && (
              <AssistantPanel pending={pendingQuestion} clearPending={() => setPendingQuestion(null)} onHighlight={setHighlight}
                messages={messages} setMessages={setMessages} />
            )}
          </aside>
        )}

        {selected && (
          <aside className="absolute inset-x-2 bottom-2 z-30 flex h-[62dvh] flex-col overflow-hidden rounded-2xl bg-ink-900/90 shadow-panel ring-1 ring-white/10 backdrop-blur-xl lg:inset-x-auto lg:bottom-3 lg:right-3 lg:top-3 lg:h-auto lg:w-[440px]">
            <CountryPanel key={selected} iso3={selected} fallbackName={selectedName} inCompare={compareList.includes(selected)}
              onClose={() => setSelected(null)} onToggleCompare={toggleCompare} onAsk={askAI}
              onSelectCountry={(iso3) => selectCountry(iso3)} onOpenSpecialty={(id) => openSpecialty(id)} />
          </aside>
        )}

        <div className={`pointer-events-none absolute bottom-3 left-3 z-10 hidden lg:block ${view !== "explore" ? "lg:left-[420px]" : ""} ${selected ? "right-[460px]" : "right-16"}`}>
          <AnalyticsBar countries={countries} legend={legend} highlightLabel={highlight?.label || null}
            highlightCount={highlight?.iso3s.length || 0} onClearHighlight={() => setHighlightState(null)} />
        </div>

        {view === "explore" && !selected && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 hidden justify-center lg:flex">
            <div className="rounded-full bg-ink-900/70 px-4 py-2 text-xs text-slate-300 ring-1 ring-white/10 backdrop-blur">
              Click any country to open its profile · switch modes above to explore specialties by category
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
