"use client";
import type { ReactNode } from "react";
import type { SpecialtyLink } from "@/lib/types";
import { CATEGORY_META, TYPE_META, fmtDate } from "@/lib/format";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-sm text-slate-400" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
      {label}
    </div>
  );
}

export function SkeletonLines({ n = 4 }: { n?: number }) {
  return (
    <div className="space-y-3 py-4" aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-white/5" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="my-4 rounded-xl bg-red-500/10 p-4 text-sm text-red-200 ring-1 ring-red-500/30" role="alert">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 text-red-300/80">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs hover:bg-red-500/30">
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="my-4 rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-400">
      <p className="font-medium text-slate-300">{title}</p>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${className}`}>{children}</span>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 font-display text-lg text-slate-100">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function SpecialtyCard({ link, showCountry = false, onClick }: { link: SpecialtyLink; showCountry?: boolean; onClick?: () => void }) {
  const cat = CATEGORY_META[link.category];
  const type = TYPE_META[link.specialty_type];
  const rc = link.rca_check;
  return (
    <article
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl bg-ink-800/80 p-3 ring-1 ring-white/5 transition hover:ring-white/15 ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: cat.color }} />
      <div className="flex gap-3 pl-1">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-xl"
          style={{ background: `linear-gradient(135deg, ${cat.color}33, ${cat.color}0d)` }}
          aria-hidden
        >
          {cat.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="truncate text-sm font-semibold text-slate-100">
              {showCountry ? link.country_name : link.specialty_name}
            </h4>
            {link.importance === "signature" && <Pill className="bg-amber-500/15 text-amber-300 ring-amber-500/30">Signature</Pill>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Pill className={type.className}>
              <span title={type.hint}>{type.label}</span>
            </Pill>
            <Pill className="bg-white/5 text-slate-400 ring-white/10">{cat.short}</Pill>
            {link.verification_status === "verified" ? (
              <Pill className="bg-emerald-500/10 text-emerald-300 ring-emerald-500/20">✓ Verified</Pill>
            ) : (
              <Pill className="bg-white/5 text-slate-400 ring-white/10">Curated</Pill>
            )}
          </div>
          {link.note && <p className="mt-2 text-xs leading-relaxed text-slate-300">{link.note}</p>}
          {rc && rc.rca !== undefined && rc.rca !== null && (
            <p className={`mt-2 rounded-md px-2 py-1 text-[11px] ${rc.confirmed ? "bg-sky-500/10 text-sky-200" : "bg-white/5 text-slate-400"}`}>
              RCA {rc.rca.toFixed(2)} · UN Comtrade {rc.year} · {rc.confirmed ? "export specialization confirmed" : "no revealed export specialization"}
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            Source:{" "}
            <a href={link.source_url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline" onClick={(e) => e.stopPropagation()}>
              {link.source_org}
            </a>{" "}
            · ref. {link.reference_year} · updated {fmtDate(link.collected_at)}
          </p>
        </div>
      </div>
    </article>
  );
}
