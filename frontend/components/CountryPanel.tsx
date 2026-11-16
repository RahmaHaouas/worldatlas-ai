"use client";
import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { CATEGORY_META, CATEGORY_ORDER, fmtNumber, fmtPct, fmtUsd } from "@/lib/format";
import type { CategoryId, CountryDetail } from "@/lib/types";
import { Empty, ErrorBox, Section, SkeletonLines, SpecialtyCard, Stat } from "./ui";

interface Props {
  iso3: string;
  fallbackName?: string;
  inCompare: boolean;
  onClose: () => void;
  onToggleCompare: (iso3: string) => void;
  onAsk: (question: string) => void;
  onSelectCountry: (iso3: string) => void;
  onOpenSpecialty: (id: string) => void;
}

function introduction(d: CountryDetail): string {
  const p = d.profile;
  const cats = CATEGORY_ORDER.filter((c) => (d.specialties[c] || []).length > 0).map((c) => CATEGORY_META[c].short.toLowerCase());
  const parts = [`${p.name} is located in ${p.region || "an unclassified region"}${p.capital ? `, with ${p.capital} as its capital` : ""}.`];
  if (d.specialty_total > 0) {
    parts.push(`WorldAtlas records ${d.specialty_total} sourced ${d.specialty_total === 1 ? "specialty" : "specialties"} across ${cats.join(", ")}.`);
  }
  const confirmed = d.trade.filter((t) => t.rca > 1).length;
  if (confirmed) parts.push(`UN Comtrade data reveals an export specialization (RCA > 1) in ${confirmed} tracked ${confirmed === 1 ? "product" : "products"}.`);
  return parts.join(" ");
}

export default function CountryPanel(props: Props) {
  const { iso3 } = props;
  const { data, error, loading, reload } = useAsync(() => api.country(iso3), iso3);
  const [tab, setTab] = useState<CategoryId | "all">("all");

  const links = useMemo(() => {
    if (!data) return [];
    const all = CATEGORY_ORDER.flatMap((c) => data.specialties[c] || []);
    return tab === "all" ? all : data.specialties[tab] || [];
  }, [data, tab]);

  const p = data?.profile;
  const name = p?.name || props.fallbackName || iso3;

  return (
    <div className="flex h-full flex-col">
      <header className="relative border-b border-white/5 p-5">
        <button onClick={props.onClose} aria-label="Close country panel" className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
          ✕
        </button>
        <div className="flex items-center gap-3">
          {p?.flag_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.flag_url} alt={`Flag of ${name}`} className="h-9 w-14 rounded object-cover ring-1 ring-white/10" />
          ) : (
            <div className="grid h-9 w-14 place-items-center rounded bg-white/5 text-xs text-slate-500">{iso3}</div>
          )}
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-semibold text-white">{name}</h2>
            <p className="text-xs text-slate-400">{p?.region || "—"} · {iso3}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => props.onToggleCompare(iso3)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition ${props.inCompare ? "bg-amber-500/20 text-amber-200 ring-amber-500/40" : "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10"}`}
          >
            {props.inCompare ? "✓ In comparison" : "+ Compare"}
          </button>
          <button
            onClick={() => props.onAsk(`What is ${name} famous for?`)}
            className="rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-200 ring-1 ring-sky-500/30 hover:bg-sky-500/25"
          >
            ✦ Ask AI about {name}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {loading && <SkeletonLines n={6} />}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data && p && (
          <>
            <p className="mt-4 text-sm leading-relaxed text-slate-300">{introduction(data)}</p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Stat label="Capital" value={p.capital || "—"} />
              <Stat label="Population" value={p.population ? fmtNumber(p.population) : "—"} sub={p.population_year ? `World Bank, ${p.population_year}` : "No reliable figure"} />
              <Stat label="Surface area" value={p.area_km2 ? `${fmtNumber(p.area_km2)} km²` : "—"} sub={p.area_year ? `World Bank, ${p.area_year}` : undefined} />
              <Stat label="Coordinates" value={p.latitude != null && p.longitude != null ? `${p.latitude.toFixed(2)}°, ${p.longitude.toFixed(2)}°` : "—"} sub="Capital city" />
            </div>

            <Section title="Specialties" right={<span className="text-[11px] text-slate-500">{data.specialty_total} records</span>}>
              <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">
                <button role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}
                  className={`rounded-full px-2.5 py-1 text-[11px] ring-1 ${tab === "all" ? "bg-white/15 text-white ring-white/20" : "text-slate-400 ring-white/10 hover:text-white"}`}>
                  All
                </button>
                {CATEGORY_ORDER.map((c) => {
                  const n = (data.specialties[c] || []).length;
                  return (
                    <button key={c} role="tab" aria-selected={tab === c} disabled={!n} onClick={() => setTab(c)}
                      className={`rounded-full px-2.5 py-1 text-[11px] ring-1 transition disabled:opacity-30 ${tab === c ? "text-white" : "text-slate-400 hover:text-white"}`}
                      style={{ background: tab === c ? `${CATEGORY_META[c].color}33` : undefined}}>
                      {CATEGORY_META[c].emoji} {CATEGORY_META[c].short} {n ? `· ${n}` : ""}
                    </button>
                  );
                })}
              </div>
              {links.length === 0 ? (
                <Empty title={`No verified specialties recorded yet for ${name}`}>
                  The platform covers every country; specialty records are added as they are verified against a source.
                </Empty>
              ) : (
                <div className="space-y-2">
                  {links.map((l) => (
                    <SpecialtyCard key={l.specialty_id} link={l} onClick={() => props.onOpenSpecialty(l.specialty_id)} />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Global position · export specialization">
              {data.trade.length === 0 ? (
                <Empty title="No tracked product with comparable trade data">Trade data comes from UN Comtrade for the tracked product list.</Empty>
              ) : (
                <>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.trade.slice(0, 8).map((t) => ({ name: t.product_name || t.hs_code, rca: +t.rca.toFixed(2) }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} stroke="#334155" />
                        <YAxis type="category" dataKey="name" width={120} tick={{ fill: "#cbd5e1", fontSize: 10 }} stroke="#334155" />
                        <Tooltip contentStyle={{ background: "#0a1424", border: "1px solid #1e293b", fontSize: 12 }} formatter={(v) => [String(v), "RCA"]} />
                        <Bar dataKey="rca" radius={[0, 4, 4, 0]}>
                          {data.trade.slice(0, 8).map((t) => (
                            <Cell key={t.hs_code} fill={t.rca > 1 ? "#38bdf8" : "#475569"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="mt-2 w-full text-left text-xs">
                    <thead className="text-slate-500">
                      <tr><th className="py-1 font-medium">Product</th><th className="font-medium">Exports</th><th className="font-medium">World share</th><th className="font-medium">RCA</th></tr>
                    </thead>
                    <tbody className="text-slate-300">
                      {data.trade.slice(0, 10).map((t) => (
                        <tr key={t.hs_code} className="border-t border-white/5">
                          <td className="py-1.5">{t.product_name} <span className="text-slate-500">({t.year})</span></td>
                          <td>{fmtUsd(t.export_value)}</td>
                          <td>{fmtPct(t.share_of_world)}</td>
                          <td className={t.rca > 1 ? "font-semibold text-sky-300" : "text-slate-400"}>{t.rca.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] text-slate-500">RCA = (country&apos;s product share of its exports) ÷ (product share of world exports). RCA &gt; 1 = revealed export specialization. Source: UN Comtrade.</p>
                </>
              )}
            </Section>

            {data.related.length > 0 && (
              <Section title="Related countries (shared specialties)">
                <div className="flex flex-wrap gap-2">
                  {data.related.map((r) => (
                    <button key={r.iso3} onClick={() => props.onSelectCountry(r.iso3)}
                      className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 ring-1 ring-white/10 hover:bg-white/10">
                      {r.name} <span className="text-slate-500">· {r.shared_specialties}</span>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            <p className="mt-6 text-[11px] text-slate-500">
              Profile data: {p.data_source === "worldbank" ? "World Bank Open Data" : "supplementary registry"}. Specialties carry their own source and reference year.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
