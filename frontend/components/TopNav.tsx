"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { CATEGORY_META } from "@/lib/format";
import type { CountrySummary, Specialty, View } from "@/lib/types";

interface Props {
  view: View;
  setView: (v: View) => void;
  countries: CountrySummary[];
  onPickCountry: (iso3: string) => void;
  onPickSpecialty: (id: string) => void;
}

const NAV: { id: View; label: string }[] = [
  { id: "explore", label: "Explore" },
  { id: "specialties", label: "Specialties" },
  { id: "compare", label: "Compare" },
  { id: "trade", label: "Global Trade" },
  { id: "assistant", label: "AI Assistant" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function TopNav({ view, setView, countries, onPickCountry, onPickSpecialty }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [specs, setSpecs] = useState<Specialty[]>([]);
  const box = useRef<HTMLDivElement | null>(null);

  const countryHits = useMemo(() => {
    const n = norm(q.trim());
    if (n.length < 2) return [];
    return countries.filter((c) => norm(c.name).includes(n) || c.iso3.toLowerCase() === n).slice(0, 6);
  }, [q, countries]);

  useEffect(() => {
    const n = q.trim();
    if (n.length < 2) { setSpecs([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      api.searchSpecialties(n).then((r) => alive && setSpecs(r.slice(0, 5))).catch(() => alive && setSpecs([]));
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (fn: () => void) => { fn(); setQ(""); setOpen(false); };

  return (
    <nav className="relative z-30 flex h-14 items-center gap-3 border-b border-white/5 bg-ink-950/80 px-3 backdrop-blur-xl sm:px-5">
      <button onClick={() => setView("explore")} className="flex shrink-0 items-center gap-2" aria-label="WorldAtlas AI home">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-sky-400 to-violet-500 text-sm font-bold text-ink-950">W</span>
        <span className="hidden font-display text-[15px] font-semibold tracking-tight text-white sm:block">WorldAtlas <span className="text-sky-300">AI</span></span>
      </button>

      <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {NAV.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)} aria-current={view === n.id ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] transition ${view === n.id ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
            {n.id === "assistant" ? "✦ " : ""}{n.label}
          </button>
        ))}
      </div>

      <div ref={box} className="relative hidden w-72 md:block">
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (countryHits[0]) pick(() => onPickCountry(countryHits[0].iso3));
              else if (specs[0]) pick(() => onPickSpecialty(specs[0].id));
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search a country or product…" aria-label="Search"
          className="w-full rounded-lg bg-ink-800/80 px-3 py-1.5 text-sm text-white placeholder-slate-500 outline-none ring-1 ring-white/10 focus:ring-sky-500/60" />
        {open && (countryHits.length > 0 || specs.length > 0) && (
          <div className="absolute right-0 mt-2 w-full overflow-hidden rounded-xl bg-ink-900/95 text-sm shadow-panel ring-1 ring-white/10 backdrop-blur-xl">
            {countryHits.length > 0 && <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-500">Countries</div>}
            {countryHits.map((c) => (
              <button key={c.iso3} onClick={() => pick(() => onPickCountry(c.iso3))} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-slate-200 hover:bg-white/5">
                {c.name}<span className="text-[11px] text-slate-500">{c.region}</span>
              </button>
            ))}
            {specs.length > 0 && <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-500">Specialties</div>}
            {specs.map((s) => (
              <button key={s.id} onClick={() => pick(() => onPickSpecialty(s.id))} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-200 hover:bg-white/5">
                <span>{CATEGORY_META[s.category].emoji}</span>{s.name}
              </button>
            ))}
            <div className="h-2" />
          </div>
        )}
      </div>
    </nav>
  );
}
