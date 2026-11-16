"use client";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { fmtDate } from "@/lib/format";
import type { CountrySummary } from "@/lib/types";

interface Props {
  countries: CountrySummary[];
  legend: { color: string; label: string; low: string; high: string };
  highlightLabel: string | null;
  highlightCount: number;
  onClearHighlight: () => void;
}

export default function AnalyticsBar({ countries, legend, highlightLabel, highlightCount, onClearHighlight }: Props) {
  const meta = useAsync(() => api.meta(), "meta");
  const withSpecs = countries.filter((c) => Object.values(c.specialty_counts || {}).some((n) => (n || 0) > 0)).length;
  const sync = meta.data?.sync;

  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-ink-900/80 px-4 py-2.5 text-xs text-slate-300 ring-1 ring-white/10 backdrop-blur-xl">
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{legend.label}</div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{legend.low}</span>
          <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, #1b3150, ${legend.color})` }} />
          <span className="text-[10px] text-slate-500">{legend.high}</span>
        </div>
      </div>
      <div className="hidden h-8 w-px bg-white/10 sm:block" />
      <Metric label="Countries" value={countries.length || "—"} />
      <Metric label="With specialties" value={withSpecs || "—"} />
      <Metric label="Specialty records" value={sync?.links ?? "—"} />
      <Metric label="Trade products" value={sync?.trade_products_with_data ?? "—"} />
      <Metric label="Last sync" value={sync ? fmtDate(sync.last_sync) : "—"} />
      {highlightLabel && (
        <button onClick={onClearHighlight} className="rounded-full bg-sky-500/15 px-3 py-1 text-[11px] text-sky-200 ring-1 ring-sky-500/30 hover:bg-sky-500/25">
          Highlight: {highlightLabel} · {highlightCount} ✕
        </button>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-display text-sm text-white">{value}</div>
    </div>
  );
}
