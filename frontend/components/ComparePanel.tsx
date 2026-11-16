"use client";
import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { CATEGORY_META, PALETTE, fmtNumber, fmtUsd } from "@/lib/format";
import type { CountrySummary } from "@/lib/types";
import { Empty, ErrorBox, Pill, Section, SkeletonLines } from "./ui";

interface Props {
  selection: string[];
  setSelection: (iso3s: string[]) => void;
  countries: CountrySummary[];
  onSelectCountry: (iso3: string) => void;
}

const tooltipStyle = { background: "#0a1424", border: "1px solid #1e293b", fontSize: 12 };

export default function ComparePanel({ selection, setSelection, countries, onSelectCountry }: Props) {
  const [adding, setAdding] = useState("");
  const key = selection.length >= 2 ? [...selection].sort().join(",") : null;
  const { data, error, loading, reload } = useAsync(() => api.compare(selection), key);
  const sorted = useMemo(() => [...countries].sort((a, b) => a.name.localeCompare(b.name)), [countries]);
  const nameOf = (iso3: string) => countries.find((c) => c.iso3 === iso3)?.name || iso3;

  const radar = useMemo(() => data?.dimensions.map((d) => {
    const row: Record<string, string | number> = { category: CATEGORY_META[d.category_id].short };
    d.values.forEach((v) => (row[v.iso3] = v.count));
    return row;
  }) || [], [data]);

  const tradeBars = useMemo(() => data?.trade.slice(0, 6).map((t) => {
    const row: Record<string, string | number> = { product: t.product_name || t.hs_code };
    t.values.forEach((v) => { if (v.export_value != null) row[v.iso3] = v.export_value; });
    return row;
  }) || [], [data]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 p-5">
        <h2 className="font-display text-lg font-semibold text-white">Country Comparison</h2>
        <p className="mt-1 text-xs text-slate-400">Pick 2 to 5 countries. Only stored values are compared; different reporting years are flagged.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {selection.map((iso3, i) => (
            <span key={iso3} className="inline-flex items-center gap-1.5 rounded-full bg-white/5 py-1 pl-2.5 pr-1 text-xs text-slate-100 ring-1 ring-white/10">
              <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              {nameOf(iso3)}
              <button aria-label={`Remove ${nameOf(iso3)}`} onClick={() => setSelection(selection.filter((x) => x !== iso3))} className="rounded-full px-1.5 text-slate-400 hover:bg-white/10 hover:text-white">✕</button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Add a country"
            className="flex-1 rounded-lg bg-ink-800 px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10">
            <option value="">Add a country…</option>
            {sorted.filter((c) => !selection.includes(c.iso3)).map((c) => <option key={c.iso3} value={c.iso3}>{c.name}</option>)}
          </select>
          <button disabled={!adding || selection.length >= 5} onClick={() => { setSelection([...selection, adding]); setAdding(""); }}
            className="rounded-lg bg-amber-500/20 px-3 text-sm text-amber-100 ring-1 ring-amber-500/40 disabled:opacity-40">Add</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {selection.length < 2 && <Empty title="Select at least two countries">Click countries on the map and use “+ Compare”, or add them above.</Empty>}
        {loading && <SkeletonLines n={8} />}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data && (
          <>
            <Section title="Key indicators">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500"><tr><th className="py-1 font-medium">Indicator</th>{data.countries.map((c) => <th key={c.iso3} className="font-medium">{c.name}</th>)}</tr></thead>
                <tbody className="text-slate-300">
                  {data.indicators.map((ind) => (
                    <tr key={ind.id} className="border-t border-white/5 align-top">
                      <td className="py-1.5">{ind.label}{!ind.comparable && <div><Pill className="mt-1 bg-amber-500/10 text-amber-300 ring-amber-500/30">years differ</Pill></div>}</td>
                      {ind.values.map((v) => <td key={v.iso3} className="py-1.5">{v.value != null ? fmtNumber(v.value) : "—"}<div className="text-[10px] text-slate-500">{v.year ?? ""}</div></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="Recorded specialties per category">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radar} outerRadius="70%">
                    <PolarGrid stroke="#1e293b" />
                    <PolarAngleAxis dataKey="category" tick={{ fill: "#cbd5e1", fontSize: 10 }} />
                    <PolarRadiusAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 9 }} stroke="#1e293b" />
                    {data.countries.map((c, i) => (
                      <Radar key={c.iso3} name={c.name} dataKey={c.iso3} stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.15} />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-slate-500">Counts of sourced specialty records in WorldAtlas — a coverage indicator, not an economic ranking.</p>
            </Section>

            <Section title="Shared specialties">
              {data.shared_specialties.length === 0 ? <p className="text-xs text-slate-500">No specialty shared by all selected countries.</p> : (
                <div className="flex flex-wrap gap-1.5">{data.shared_specialties.map((s) => <Pill key={s.specialty_id} className="bg-white/5 text-slate-200 ring-white/10">{s.name}</Pill>)}</div>
              )}
            </Section>

            <Section title="Distinctive specialties">
              <div className="grid gap-3 sm:grid-cols-2">
                {data.countries.map((c, i) => (
                  <div key={c.iso3} className="rounded-xl bg-ink-800/70 p-3 ring-1 ring-white/5">
                    <button onClick={() => onSelectCountry(c.iso3)} className="text-sm font-medium hover:underline" style={{ color: PALETTE[i % PALETTE.length] }}>{c.name}</button>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-300">
                      {(data.unique_specialties[c.iso3] || []).slice(0, 8).map((s) => <li key={s.specialty_id}>• {s.name}</li>)}
                      {(data.unique_specialties[c.iso3] || []).length === 0 && <li className="text-slate-500">—</li>}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Export statistics (UN Comtrade)">
              {data.trade.length === 0 ? <Empty title="No tracked product with trade data for these countries" /> : (
                <>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={tradeBars} margin={{ left: 0, right: 8, bottom: 40 }}>
                        <CartesianGrid stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="product" angle={-30} textAnchor="end" interval={0} tick={{ fill: "#cbd5e1", fontSize: 10 }} stroke="#334155" />
                        <YAxis tickFormatter={(v) => fmtUsd(Number(v))} tick={{ fill: "#94a3b8", fontSize: 10 }} stroke="#334155" width={64} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmtUsd(Number(v)), nameOf(String(n))]} />
                        {data.countries.map((c, i) => <Bar key={c.iso3} dataKey={c.iso3} name={c.iso3} fill={PALETTE[i % PALETTE.length]} radius={[3, 3, 0, 0]} />)}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="mt-2 w-full text-left text-xs">
                    <thead className="text-slate-500"><tr><th className="py-1 font-medium">Product · RCA</th>{data.countries.map((c) => <th key={c.iso3} className="font-medium">{c.name}</th>)}</tr></thead>
                    <tbody className="text-slate-300">
                      {data.trade.map((t) => (
                        <tr key={t.hs_code} className="border-t border-white/5">
                          <td className="py-1.5">{t.product_name}{!t.comparable && <Pill className="ml-1 bg-amber-500/10 text-amber-300 ring-amber-500/30">years differ</Pill>}</td>
                          {t.values.map((v) => (
                            <td key={v.iso3} className={v.rca != null && v.rca > 1 ? "font-semibold text-sky-300" : "text-slate-400"}>
                              {v.rca != null ? v.rca.toFixed(2) : "—"}{v.year ? <span className="ml-1 text-[10px] text-slate-500">{v.year}</span> : null}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] text-slate-500">“—” = no comparable record (not reported, or country total missing). RCA &gt; 1 = revealed export specialization.</p>
                </>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
