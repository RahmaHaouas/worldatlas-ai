"use client";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/format";
import type { MapMode } from "@/lib/types";

interface Props {
  mode: MapMode;
  setMode: (m: MapMode) => void;
  projection: "globe" | "mercator";
  setProjection: (p: "globe" | "mercator") => void;
}

const MODES: { id: MapMode; label: string; emoji: string }[] = [
  { id: "countries", label: "Countries", emoji: "🗺️" },
  ...CATEGORY_ORDER.map((c) => ({ id: c as MapMode, label: CATEGORY_META[c].short, emoji: CATEGORY_META[c].emoji })),
  { id: "trade", label: "Global trade", emoji: "🚢" },
];

export default function ModeBar({ mode, setMode, projection, setProjection }: Props) {
  return (
    <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-ink-900/80 p-1 ring-1 ring-white/10 backdrop-blur-xl no-scrollbar" role="toolbar" aria-label="Map visualization mode">
      {MODES.map((m) => (
        <button key={m.id} onClick={() => setMode(m.id)} aria-pressed={mode === m.id}
          className={`shrink-0 rounded-xl px-2.5 py-1.5 text-[12px] transition ${mode === m.id ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}>
          <span className="mr-1" aria-hidden>{m.emoji}</span>{m.label}
        </button>
      ))}
      <span className="mx-1 h-5 w-px shrink-0 bg-white/10" />
      <button onClick={() => setProjection(projection === "globe" ? "mercator" : "globe")}
        className="shrink-0 rounded-xl px-2.5 py-1.5 text-[12px] text-slate-300 hover:text-white" title="Toggle globe / flat map">
        {projection === "globe" ? "🌐 Globe" : "▭ Flat"}
      </button>
    </div>
  );
}
