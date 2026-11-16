import type { CategoryId, SpecialtyType } from "./types";

export function fmtNumber(v?: number | null, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtCompact(v?: number | null): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

export function fmtUsd(v?: number | null): string {
  if (v === null || v === undefined) return "—";
  return "US$" + fmtCompact(v);
}

export function fmtPct(v?: number | null, digits = 1): string {
  if (v === null || v === undefined) return "—";
  return (v * 100).toFixed(digits) + "%";
}

export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
}

export const CATEGORY_META: Record<CategoryId, { label: string; short: string; color: string; emoji: string }> = {
  agriculture: { label: "Agriculture & Food", short: "Agriculture", color: "#4ade80", emoji: "🌾" },
  industry: { label: "Industry & Manufacturing", short: "Industry", color: "#60a5fa", emoji: "🏭" },
  culture: { label: "Culture & Heritage", short: "Culture", color: "#f472b6", emoji: "🏛️" },
  technology: { label: "Technology & Innovation", short: "Technology", color: "#a78bfa", emoji: "🧠" },
  resources: { label: "Natural Resources & Energy", short: "Resources", color: "#fbbf24", emoji: "⛏️" },
  tourism: { label: "Tourism & Services", short: "Tourism & Services", color: "#22d3ee", emoji: "✈️" },
};

export const CATEGORY_ORDER: CategoryId[] = ["agriculture", "industry", "culture", "technology", "resources", "tourism"];

export const TYPE_META: Record<SpecialtyType, { label: string; className: string; hint: string }> = {
  cultural: { label: "Cultural", className: "bg-pink-500/15 text-pink-300 ring-pink-500/30", hint: "Cultural specialty — not proof of economic dominance" },
  production: { label: "Production", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30", hint: "Production specialization" },
  export: { label: "Export", className: "bg-sky-500/15 text-sky-300 ring-sky-500/30", hint: "Export specialization (checked with RCA when trade data exists)" },
  characteristic: { label: "Characteristic", className: "bg-slate-500/20 text-slate-300 ring-slate-500/30", hint: "General national characteristic" },
};

export const PALETTE = ["#38bdf8", "#f59e0b", "#a78bfa", "#4ade80", "#f472b6"];
