"use client";

import { useEffect, useState } from "react";
import { rpc, type Overview } from "@/lib/admin";

const RANGES: { label: string; days: number | null }[] = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "All time", days: null },
];

function delta(cur: number, prev: number | null): string | null {
  if (prev === null || prev <= 0) return null;
  const p = Math.round(((cur - prev) / prev) * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

export function AdminOverview() {
  const [days, setDays] = useState<number | null>(7);
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setErr(null);
    rpc<Overview>("admin_overview", { p_days: days }).then((v) => alive && setO(v)).catch((e: Error) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [days]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold leading-tight">Overview</h1>
        <div role="group" aria-label="Time range" className="flex gap-1 text-[13px] font-bold">
          {RANGES.map((r) => (
            <button key={r.label} type="button" data-testid={`range-${r.days ?? "all"}`} aria-pressed={days === r.days} onClick={() => setDays(r.days)}
              className={`rounded-full px-3 py-1.5 ${days === r.days ? "bg-white text-ink ring-1 ring-line" : "text-muted hover:bg-white/60"}`}>{r.label}</button>
          ))}
        </div>
      </div>
      {err && <p role="alert" className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-medium">Could not load: {err}</p>}
      {!o && !err && <p className="text-sm text-muted">Loading…</p>}
      {o && <Body o={o} />}
    </>
  );
}

function Body({ o }: { o: Overview }) {
  const stats: { id: string; n: number; label: string; d?: string | null }[] = [
    { id: "visits", n: o.visits, label: "Visits", d: delta(o.visits, o.visits_prev) },
    { id: "signups", n: o.signups, label: "Sign-ups", d: delta(o.signups, o.signups_prev) },
    { id: "started", n: o.started, label: "Fonts started" },
    { id: "downloads", n: o.downloads, label: "Downloads" },
    { id: "active", n: o.active_week, label: "Active this week" },
  ];
  const top = Math.max(1, ...o.daily.map((d) => d.n));
  const steps = [
    { label: "Visited", n: o.visits },
    { label: "Signed up", n: o.signups },
    { label: "Started a font", n: o.started },
    { label: "Downloaded", n: o.downloads },
  ];
  const widest = Math.max(1, ...steps.map((s) => s.n));
  const paths = [{ label: "Photo", n: o.by_path.photo, c: "bg-ink" }, { label: "Drawn", n: o.by_path.draw, c: "bg-[#8468D2]" }, { label: "SVG import", n: o.by_path.svg, c: "bg-coral" }];
  const pathTop = Math.max(1, ...paths.map((p) => p.n));
  const dense = o.daily.length > 7;

  return (
    <div className="flex flex-col gap-4" data-testid="overview">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <div key={s.id} data-testid={`stat-${s.id}`} className="rounded-[18px] border border-line bg-white p-4">
            <b className="block font-display text-[30px] leading-none">{s.n.toLocaleString("en-US")}</b>
            <span className="text-[13px] text-muted">{s.label}</span>
            {s.d && <span className={`ml-1.5 text-xs font-bold ${s.d.startsWith("-") ? "text-plum" : "text-[#2b7a3d]"}`}>{s.d}</span>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className="rounded-[18px] border border-line bg-white p-4">
          <h2 className="mb-3 font-display text-base font-bold">Sign-ups per day</h2>
          <div className="flex h-[150px] items-end gap-1.5" role="img" aria-label="Sign-ups per day">
            {o.daily.map((d, i) => (
              <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${d.n}`}>
                <span className="text-[11px] font-bold text-muted">{d.n > 0 ? d.n : ""}</span>
                <div className={`w-full max-w-9 rounded ${i === o.daily.length - 1 ? "bg-coral" : "bg-ink"}`} style={{ height: `${Math.max(d.n > 0 ? 6 : 2, (d.n / top) * 100)}px`, opacity: d.n === 0 ? 0.25 : 1 }} />
                <span className="h-4 text-[11px] text-muted">{!dense || i % 5 === 0 ? (dense ? d.day.slice(8) : new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })) : ""}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[18px] border border-line bg-white p-4">
          <h2 className="mb-3 font-display text-base font-bold">Where people get to</h2>
          <div className="flex flex-col gap-2.5">
            {steps.map((s, i) => {
              const before = i > 0 ? steps[i - 1].n : 0;
              const pct = i > 0 && before > 0 && s.n <= before ? `${Math.round((s.n / before) * 100)}%` : null;
              return (
                <div key={s.label} data-testid={`funnel-${i}`} className="flex items-center gap-3 text-sm">
                  <span className="w-[116px] shrink-0">{s.label}</span>
                  <div className="h-[22px] min-w-[6px] rounded-md" style={{ width: `${Math.max(2, (s.n / widest) * 100) * 0.55}%`, background: i === 3 ? "#FA7E00" : "#264022" }} />
                  <b>{s.n.toLocaleString("en-US")}</b>
                  {pct && <span className="text-xs text-muted">{pct}</span>}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">These are counts of what happened, not people. Visits include any page that runs scripts.</p>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[18px] border border-line bg-white p-4">
          <h2 className="mb-3 font-display text-base font-bold">How fonts are started</h2>
          <div className="flex flex-col gap-2">
            {paths.map((p) => (
              <div key={p.label} className="flex items-center gap-3 text-sm">
                <span className="w-[90px]">{p.label}</span>
                <div className={`h-3.5 rounded ${p.c}`} style={{ width: `${Math.max(p.n > 0 ? 4 : 0, (p.n / pathTop) * 60)}%` }} />
                <b>{p.n}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-[18px] border border-line bg-white p-4">
          <h2 className="mb-3 font-display text-base font-bold">Downloads</h2>
          <dl className="flex flex-col gap-1.5 text-sm">
            {[[".ttf", o.by_format.ttf], [".woff2", o.by_format.woff2], ["Zip", o.by_format.zip]].map(([k, v]) => (
              <div key={k} className="flex justify-between"><dt>{k}</dt><dd className="font-bold">{v}</dd></div>
            ))}
          </dl>
          {o.avg_letters !== null && <p className="mt-3 text-[13px] text-muted">Average letters drawn at download: {o.avg_letters} of 38</p>}
        </section>
      </div>
    </div>
  );
}
