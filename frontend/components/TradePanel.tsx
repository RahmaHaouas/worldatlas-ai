"use client";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { PALETTE, fmtPct, fmtUsd } from "@/lib/format";
import type { CountrySummary, ProductTrade } from "@/lib/types";
import { Empty, ErrorBox, Pill, Section, SkeletonLines, Stat } from "./ui";

interface Props {
  hs: string | null;
  setHs: (hs: string) => void;
  countries: Record<string, CountrySummary>;
  onData: (d: ProductTrade | null) => void;
  onSelectCountry: (iso3: string) => void;
}

const tooltipStyle = { background: "#0a1424", border: "1px solid #1e293b", fontSize: 12 };

export default function TradePanel({ hs, setHs, countries, onData, onSelectCountry }: Props) {
  const products = useAsync(() => api.tradeProducts(), "products");
  const [year, setYear] = useState<number | null>(null);
  const [metric, setMetric] = useState<"value" | "rca">("value");

  useEffect(() => {
    if (!hs && products.data?.products.length) setHs(products.data.products[0].hs_code);
  }, [hs, products.data, setHs]);

  const trade = useAsync(() => api.tradeProduct(hs as string, year ?? undefined), hs ? `${hs}|${year ?? "latest"}` : null);
  useEffect(() => {
    onData(trade.data);
  }, [trade.data, onData]);
  useEffect(() => () => onData(null), [onData]);

  const top = useMemo(() => (trade.data?.rows || []).slice(0, 5).map((r) => r.iso3), [trade.data]);
  const history = useAsync(() => api.tradeHistory(hs as string, top), hs && top.length ? `${hs}|${top.join(",")}` : null);
  const name = (iso3: string) => countries[iso3]?.name || iso3;

  const ranked = useMemo(() => {
    const rows = [...(trade.data?.rows || [])];
    return metric === "rca" ? rows.sort((a, b) => b.rca - a.rca) : rows;
  }, [trade.data, metric]);

  const series = useMemo(() => history.data?.series.map((p) => {
    const row: Record<string, number | string> = { year: String(p.year) };
    top.forEach((iso3) => { const v = p.countries[iso3]; if (v) row[iso3] = v.export_value; });
    return row;
  }) || [], [history.data, top]);

  if (products.error) {
    return <div className="p-5"><ErrorBox message={products.error} onRetry={products.reload} /></div>;
  }

  const d = trade.data;
  const specializedCount = d ? d.rows.filter((r) => r.specialized).length : 0;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 p-5">
        <h2 className="font-display text-lg font-semibold text-white">Global Trade Intelligence</h2>
        <p className="mt-1 text-xs text-slate-400">Exporters and Revealed Comparative Advantage (RCA) computed from UN Comtrade. The map is coloured by RCA.</p>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <select value={hs || ""} onChange={(e) => { setHs(e.target.value); setYear(null); }} aria-label="Product"
            className="rounded-lg bg-ink-800 px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10">
            {products.data?.products.map((p) => <option key={p.hs_code} value={p.hs_code}>{p.name} (HS {p.hs_code})</option>)}
          </select>
          <select value={year ?? ""} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)} aria-label="Year"
            className="rounded-lg bg-ink-800 px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10">
            <option value="">Latest</option>
            {products.data?.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {(products.loading || trade.loading) && <SkeletonLines n={8} />}
        {trade.error && <ErrorBox message={trade.error} onRetry={trade.reload} />}
        {d && d.world.status !== "ok" && (
          <Empty title="RCA not computed for this selection">Not enough consistent reporters for {d.year}. WorldAtlas does not compute RCA from incomplete data.</Empty>
        )}
        {d && d.world.status === "ok" && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat label="World exports" value={fmtUsd(d.world.world_product_exports)} sub={`${d.year}, reporting countries`} />
              <Stat label="Exporters" value={d.world.reporters_with_product} sub={`of ${d.world.reporters_with_totals} reporters`} />
              <Stat label="RCA > 1" value={specializedCount} sub="specialized exporters" />
            </div>

            <Section title="Top exporters" right={
              <div className="flex gap-1">
                {(["value", "rca"] as const).map((m) => (
                  <button key={m} onClick={() => setMetric(m)} className={`rounded-md px-2 py-0.5 text-[11px] ring-1 ${metric === m ? "bg-white/15 text-white ring-white/20" : "text-slate-400 ring-white/10"}`}>
                    {m === "value" ? "By value" : "By RCA"}
                  </button>
                ))}
              </div>}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ranked.slice(0, 10).map((r) => ({ name: name(r.iso3), v: metric === "value" ? r.export_value : +r.rca.toFixed(2) }))} margin={{ left: 0, right: 8, bottom: 40 }}>
                    <CartesianGrid stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} tick={{ fill: "#cbd5e1", fontSize: 10 }} stroke="#334155" />
                    <YAxis tickFormatter={(v) => (metric === "value" ? fmtUsd(Number(v)) : String(v))} tick={{ fill: "#94a3b8", fontSize: 10 }} stroke="#334155" width={64} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [metric === "value" ? fmtUsd(Number(v)) : String(v), metric === "value" ? "Exports" : "RCA"]} />
                    <Bar dataKey="v" fill={metric === "value" ? "#38bdf8" : "#a78bfa"} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="mt-2 w-full text-left text-xs">
                <thead className="text-slate-500"><tr><th className="py-1 font-medium">#</th><th className="font-medium">Country</th><th className="font-medium">Exports</th><th className="font-medium">World share</th><th className="font-medium">Of its exports</th><th className="font-medium">RCA</th></tr></thead>
                <tbody className="text-slate-300">
                  {ranked.slice(0, 15).map((r) => (
                    <tr key={r.iso3} className="cursor-pointer border-t border-white/5 hover:bg-white/5" onClick={() => onSelectCountry(r.iso3)}>
                      <td className="py-1.5 text-slate-500">{r.rank_by_value}</td>
                      <td>{name(r.iso3)}</td>
                      <td>{fmtUsd(r.export_value)}</td>
                      <td>{fmtPct(r.share_of_world)}</td>
                      <td>{fmtPct(r.share_of_country_exports, 2)}</td>
                      <td>{r.specialized ? <Pill className="bg-sky-500/15 text-sky-300 ring-sky-500/30">{r.rca.toFixed(2)}</Pill> : <span className="text-slate-500">{r.rca.toFixed(2)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="Trade evolution · top 5 exporters">
              {history.loading && <SkeletonLines n={3} />}
              {series.length < 2 ? (
                <p className="text-xs text-slate-500">Add more years in the TradeYears stack parameter to see the evolution over time.</p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ left: 0, right: 12 }}>
                      <CartesianGrid stroke="#1e293b" />
                      <XAxis dataKey="year" tick={{ fill: "#cbd5e1", fontSize: 10 }} stroke="#334155" />
                      <YAxis tickFormatter={(v) => fmtUsd(Number(v))} tick={{ fill: "#94a3b8", fontSize: 10 }} stroke="#334155" width={64} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmtUsd(Number(v)), name(String(n))]} />
                      <Legend formatter={(v) => name(String(v))} wrapperStyle={{ fontSize: 11 }} />
                      {top.map((iso3, i) => <Line key={iso3} type="monotone" dataKey={iso3} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Section>

            <p className="mt-6 rounded-lg bg-white/[0.03] p-3 text-[11px] leading-relaxed text-slate-400 ring-1 ring-white/5">
              <b className="text-slate-300">Method.</b> RCA(c,p) = (X<sub>c,p</sub> / X<sub>c</sub>) ÷ (X<sub>w,p</sub> / X<sub>w</sub>). World totals are summed over the {d.world.reporters_with_totals} countries that reported total exports for {d.year}, so numerator and denominator are consistent.
              {d.world.excluded_no_total && d.world.excluded_no_total.length > 0 && <> Excluded (no total reported): {d.world.excluded_no_total.join(", ")}.</>} Source: UN Comtrade.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
