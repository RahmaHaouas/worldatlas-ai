"use client";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { CATEGORY_META, CATEGORY_ORDER, TYPE_META, fmtPct, fmtUsd } from "@/lib/format";
import type { CategoryId, CountrySummary, SpecialtyDetail } from "@/lib/types";
import { Empty, ErrorBox, Pill, Section, SkeletonLines, Spinner, SpecialtyCard } from "./ui";

interface Props {
  specialtyId: string | null;
  onOpen: (id: string | null) => void;
  countries: Record<string, CountrySummary>;
  onHighlight: (iso3s: string[] | null, label?: string) => void;
  onSelectCountry: (iso3: string) => void;
  onCompare: (iso3s: string[]) => void;
  onAsk: (q: string) => void;
}

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function SpecialtyExplorer(props: Props) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<CategoryId | "">("");
  const dq = useDebounced(q);
  const results = useAsync(() => api.searchSpecialties(dq, category || undefined), `${dq}|${category}`);

  if (props.specialtyId) return <SpecialtyView {...props} id={props.specialtyId} />;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 p-5">
        <h2 className="font-display text-lg font-semibold text-white">Global Specialty Explorer</h2>
        <p className="mt-1 text-xs text-slate-400">Search a product, resource, tradition or technology — see which countries are associated with it.</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Try "olive oil", "cocoa", "phosphate", "robots"…'
          aria-label="Search specialties"
          className="mt-4 w-full rounded-xl bg-ink-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none ring-1 ring-white/10 focus:ring-sky-500/60"
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button onClick={() => setCategory("")} className={`rounded-full px-2.5 py-1 text-[11px] ring-1 ${category === "" ? "bg-white/15 text-white ring-white/20" : "text-slate-400 ring-white/10"}`}>All</button>
          {CATEGORY_ORDER.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`rounded-full px-2.5 py-1 text-[11px] ring-1 ring-white/10 ${category === c ? "text-white" : "text-slate-400 hover:text-white"}`}
              style={{ background: category === c ? `${CATEGORY_META[c].color}33` : undefined }}>
              {CATEGORY_META[c].emoji} {CATEGORY_META[c].short}
            </button>
          ))}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        {results.loading && <Spinner label="Searching…" />}
        {results.error && <ErrorBox message={results.error} onRetry={results.reload} />}
        {results.data && results.data.length === 0 && <Empty title="No matching specialty">Try a broader term or another category.</Empty>}
        <ul className="space-y-2">
          {results.data?.map((s) => (
            <li key={s.id}>
              <button onClick={() => props.onOpen(s.id)}
                className="flex w-full items-center gap-3 rounded-xl bg-ink-800/70 p-3 text-left ring-1 ring-white/5 transition hover:ring-white/20">
                <span className="grid h-9 w-9 place-items-center rounded-lg text-lg" style={{ background: `${CATEGORY_META[s.category].color}26` }}>{CATEGORY_META[s.category].emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-100">{s.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">{CATEGORY_META[s.category].label}{s.hs_code ? ` · HS ${s.hs_code}` : ""}</span>
                </span>
                <span className="text-xs text-slate-400">{s.country_count ?? 0} {s.country_count === 1 ? "country" : "countries"}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SpecialtyView(props: Props & { id: string }) {
  const { data, error, loading, reload } = useAsync<SpecialtyDetail>(() => api.specialty(props.id), props.id);
  const [picked, setPicked] = useState<string[]>([]);
  const { onHighlight } = props;

  useEffect(() => {
    if (data) onHighlight(data.countries.map((c) => c.iso3), data.specialty.name);
    return () => onHighlight(null);
  }, [data, onHighlight]);

  const toggle = (iso3: string) => setPicked((p) => (p.includes(iso3) ? p.filter((x) => x !== iso3) : [...p, iso3].slice(-5)));
  const name = (iso3: string) => props.countries[iso3]?.name || iso3;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 p-5">
        <button onClick={() => props.onOpen(null)} className="text-xs text-sky-300 hover:underline">← All specialties</button>
        {data && (
          <>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl text-2xl" style={{ background: `${CATEGORY_META[data.specialty.category].color}26` }}>
                {CATEGORY_META[data.specialty.category].emoji}
              </span>
              <div>
                <h2 className="font-display text-lg font-semibold text-white">{data.specialty.name}</h2>
                <p className="text-[11px] text-slate-400">{CATEGORY_META[data.specialty.category].label}{data.specialty.hs_code ? ` · HS ${data.specialty.hs_code}` : ""}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-300">{data.specialty.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => props.onAsk(`Which countries are associated with ${data.specialty.name.toLowerCase()}${data.specialty.hs_code ? " and which export it the most" : ""}?`)}
                className="rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-200 ring-1 ring-sky-500/30 hover:bg-sky-500/25">
                ✦ Explain with AI
              </button>
              <button disabled={picked.length < 2} onClick={() => props.onCompare(picked)}
                className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 ring-1 ring-amber-500/30 hover:bg-amber-500/25 disabled:opacity-40">
                Compare selected ({picked.length})
              </button>
            </div>
          </>
        )}
      </header>
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {loading && <SkeletonLines n={6} />}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data && (
          <>
            <Section title={`Associated countries · ${data.countries.length}`}>
              {data.countries.length === 0 && <Empty title="No country linked yet" />}
              <div className="space-y-2">
                {data.countries.map((l) => (
                  <div key={l.iso3} className="flex items-start gap-2">
                    <input type="checkbox" aria-label={`Select ${l.country_name} for comparison`} checked={picked.includes(l.iso3)} onChange={() => toggle(l.iso3)}
                      className="mt-4 h-4 w-4 accent-amber-400" />
                    <div className="flex-1"><SpecialtyCard link={l} showCountry onClick={() => props.onSelectCountry(l.iso3)} /></div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                {Object.entries(TYPE_META).map(([k, t]) => <Pill key={k} className={t.className}>{t.label}: {t.hint}</Pill>)}
              </div>
            </Section>

            {data.specialty.hs_code && (
              <Section title="Production & export data">
                {!data.trade ? (
                  <Empty title="Trade data not available yet">Run the data pipeline to pull UN Comtrade figures for HS {data.specialty.hs_code}.</Empty>
                ) : (
                  <>
                    <p className="mb-2 text-xs text-slate-400">
                      UN Comtrade {data.trade.year} · world exports (reporting countries): <span className="text-slate-200">{fmtUsd(data.trade.world.world_product_exports)}</span> · {data.trade.world.reporters_with_product} reporting exporters
                    </p>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.trade.rows.slice(0, 10).map((r) => ({ name: name(r.iso3), value: r.export_value }))} margin={{ left: 0, right: 8, bottom: 40 }}>
                          <CartesianGrid stroke="#1e293b" vertical={false} />
                          <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} tick={{ fill: "#cbd5e1", fontSize: 10 }} stroke="#334155" />
                          <YAxis tickFormatter={(v) => fmtUsd(Number(v))} tick={{ fill: "#94a3b8", fontSize: 10 }} stroke="#334155" width={64} />
                          <Tooltip contentStyle={{ background: "#0a1424", border: "1px solid #1e293b", fontSize: 12 }} formatter={(v) => [fmtUsd(Number(v)), "Exports"]} />
                          <Bar dataKey="value" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <table className="mt-2 w-full text-left text-xs">
                      <thead className="text-slate-500"><tr><th className="py-1 font-medium">#</th><th className="font-medium">Country</th><th className="font-medium">Exports</th><th className="font-medium">Share</th><th className="font-medium">RCA</th></tr></thead>
                      <tbody className="text-slate-300">
                        {data.trade.rows.slice(0, 12).map((r) => (
                          <tr key={r.iso3} className="cursor-pointer border-t border-white/5 hover:bg-white/5" onClick={() => props.onSelectCountry(r.iso3)}>
                            <td className="py-1.5 text-slate-500">{r.rank_by_value}</td>
                            <td>{name(r.iso3)}</td>
                            <td>{fmtUsd(r.export_value)}</td>
                            <td>{fmtPct(r.share_of_world)}</td>
                            <td className={r.rca > 1 ? "font-semibold text-sky-300" : "text-slate-400"}>{r.rca.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[11px] text-slate-500">Ranks cover reporting countries only. Exports are values reported by exporters (UN Comtrade).</p>
                  </>
                )}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
