"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlyphEditor } from "@/components/GlyphEditor";
import { GlyphSvg } from "@/components/GlyphTile";
import { FontSwitcher } from "@/components/FontSwitcher";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import { layout } from "@/lib/handwriting/pipeline";
import { stepIndex, useSteps } from "@/lib/handwriting/steps";
import { loadProject, removeGlyph, updateGlyph } from "@/lib/handwriting/store";
import type { Glyph, LayoutCell } from "@/lib/handwriting/types";

type TabId = "letters" | "marks" | "extras";

const SHEET2 = layout.sheets[1].cells;
const TABS: { id: TabId; label: string; cells: LayoutCell[] }[] = [
  { id: "letters", label: "Letters", cells: layout.sheets[0].cells },
  { id: "marks", label: "Vowel marks", cells: SHEET2.filter((c) => c.kind === "fili") },
  { id: "extras", label: "Extras", cells: SHEET2.filter((c) => c.kind === "symbol") },
];

type Status = "checked" | "open" | "traced" | "missing";
const STATUS_WORD: Record<Status, string> = { checked: "Checked", open: "Open now", traced: "Not checked yet", missing: "Not drawn" };

function Tile({ cell, glyph, open, onPick }: { cell: LayoutCell; glyph?: Glyph; open: boolean; onPick: () => void }) {
  const status: Status = open ? "open" : !glyph ? "missing" : glyph.checked ? "checked" : "traced";
  const cls: Record<Status, string> = {
    checked: "border border-[#CFE3D5] bg-teal-soft",
    open: "border-[1.5px] border-coral bg-white",
    traced: "border border-line bg-white",
    missing: "border border-dashed border-[#BDCFC2] bg-[#F3F9F5]",
  };
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`${STATUS_WORD[status]}: ${cell.label}`}
      aria-current={open ? "true" : undefined}
      data-cell={cell.id}
      data-status={glyph ? (glyph.checked ? "checked" : "traced") : "missing"}
      className={`flex h-11 w-11 items-center justify-center rounded-[10px] ${cls[status]}`}
    >
      {glyph ? (
        <GlyphSvg glyph={glyph} className="h-full w-full p-0.5" />
      ) : (
        <span lang="dv" className="font-thaana text-[22px] leading-none text-muted">{cell.label}</span>
      )}
    </button>
  );
}

export function LettersClient() {
  const steps = useSteps();
  const [glyphs, setGlyphs] = useState<Record<string, Glyph>>({});
  const [originals, setOriginals] = useState<Record<string, Glyph>>({});
  const [loaded, setLoaded] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [tab, setTab] = useState<TabId>("letters");
  const [selId, setSelId] = useState<string>(TABS[0].cells[0].id);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    loadProject().then((p) => {
      setGlyphs(p.glyphs);
      setOriginals(p.originals ?? {});
      setDrawn(p.path === "draw");
      // start on the first letter that has not been checked
      const first = TABS[0].cells.find((c) => !p.glyphs[c.id]?.checked) ?? TABS[0].cells[0];
      setSelId(first.id);
      setLoaded(true);
    });
  }, []);

  const cells = TABS.find((t) => t.id === tab)!.cells;
  const cell = useMemo(() => cells.find((c) => c.id === selId) ?? cells[0], [cells, selId]);
  const idx = cells.findIndex((c) => c.id === cell.id);

  // writes go one after another so two quick edits cannot overwrite each other
  const persist = useCallback((job: () => Promise<unknown>) => {
    queue.current = queue.current.then(job, job);
  }, []);

  const glyphsRef = useRef(glyphs);
  glyphsRef.current = glyphs;

  const onChange = useCallback((id: string, g: Glyph | null) => {
    if (g) {
      const keep = { ...g, checked: glyphsRef.current[id]?.checked };
      setGlyphs((p) => ({ ...p, [id]: keep }));
      persist(async () => {
        const p = await updateGlyph(keep);
        setOriginals(p.originals ?? {});
      });
    } else {
      setGlyphs((p) => { const n = { ...p }; delete n[id]; return n; });
      persist(async () => { const p = await removeGlyph(id); setOriginals(p.originals ?? {}); });
    }
  }, [persist]);

  function go(i: number, markChecked: boolean) {
    const g = glyphs[cell.id];
    if (markChecked && g && !g.checked) {
      const next = { ...g, checked: true };
      setGlyphs((p) => ({ ...p, [cell.id]: next }));
      persist(async () => { await updateGlyph(next); });
    }
    const target = cells[Math.min(Math.max(i, 0), cells.length - 1)];
    setSelId(target.id);
  }

  const doneCount = cells.filter((c) => (drawn ? glyphs[c.id] : glyphs[c.id]?.checked)).length;
  const anyGlyph = Object.keys(glyphs).length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white px-10 py-4">
        <div className="flex flex-wrap items-center gap-4"><Logo /><FontSwitcher /></div>
        <Stepper steps={steps} current={stepIndex(steps, "/handwriting/letters", 2)} />
        <span className="hidden items-center gap-2 text-sm text-muted 2xl:flex">
          <span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1280px] flex-wrap items-start gap-6 px-10 py-8">
        <div className="flex w-full flex-col gap-4 lg:w-[360px]">
        <section aria-label="Letters" className="flex w-full flex-col gap-4 rounded-3xl border border-line bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-bold">{TABS.find((t) => t.id === tab)!.label}</h2>
            <span className="text-sm text-muted" data-testid="progress">{doneCount} of {cells.length} {drawn ? "drawn" : "cleaned up"}</span>
          </div>
          <div className="h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-teal" style={{ width: `${(doneCount / cells.length) * 100}%` }} /></div>
          <div role="tablist" aria-label="Which letters" className="flex flex-wrap gap-1 text-sm font-medium">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => { setTab(t.id); setSelId(t.cells[0].id); }}
                className={`rounded-full px-3 py-1.5 ${tab === t.id ? "bg-ink text-white" : "text-muted hover:bg-paper"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div dir="rtl" className="grid grid-cols-6 justify-between gap-1.5" data-testid="grid">
            {cells.map((c) => (
              <Tile key={c.id} cell={c} glyph={glyphs[c.id]} open={c.id === cell.id} onPick={() => setSelId(c.id)} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted">
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border border-[#CFE3D5] bg-teal-soft" />Checked</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border-[1.5px] border-coral bg-white" />Open now</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border border-line bg-white" />Not checked yet</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border border-dashed border-[#BDCFC2] bg-[#F3F9F5]" />Not drawn</li>
          </ul>
        </section>
          <div className="flex flex-col gap-2 rounded-3xl bg-teal-soft p-5">
            <h2 className="font-display text-base font-bold text-teal">Keep it on the guides</h2>
            <p className="text-sm leading-normal">Draw between Top and Baseline so vowel marks have room above and below.</p>
          </div>
          <Link
            href="/handwriting/level"
            data-testid="continue-level"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal text-base font-bold text-white hover:bg-teal-dark"
          >
            Level the letters <span aria-hidden>→</span>
          </Link>
        </div>

        <section aria-label="Drawing area" className="flex min-w-0 flex-[1_1_520px] flex-col gap-4 rounded-3xl border border-line bg-white p-5">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-xl font-bold" lang="dv"><span className="font-thaana text-[26px]">{cell.label}</span></h1>
            <span className="text-sm text-muted">U+{cell.id}</span>
          </div>
          {loaded && !anyGlyph && (
            drawn ? (
              <p className="rounded-xl bg-sand px-4 py-3 text-sm" role="status" data-testid="draw-hint">
                Draw this letter with the marker. Have SVG files already? <Link href="/draw" className="font-bold text-teal underline underline-offset-4" data-testid="bring-svg">Bring in SVG files</Link>
              </p>
            ) : (
              <p className="rounded-xl bg-sand px-4 py-3 text-sm" role="status">
                Nothing traced yet. <Link href="/handwriting" className="font-bold text-teal underline underline-offset-4">Add a photo of your sheet</Link>, or draw letters here with the pen.
              </p>
            )
          )}
          {loaded && (
            <GlyphEditor
              key={`${tab}-${cell.id}`}
              cell={cell}
              glyph={glyphs[cell.id] ?? null}
              original={originals[cell.id] ?? null}
              onChange={(g) => onChange(cell.id, g)}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <button type="button" disabled={idx <= 0} onClick={() => go(idx - 1, false)} className="flex h-11 items-center gap-2 rounded-xl border border-[#BDCFC2] px-4 text-sm font-bold hover:bg-paper disabled:opacity-40">
              <span aria-hidden>←</span>
              <span lang="dv" className="font-thaana text-xl leading-none">{idx > 0 ? cells[idx - 1].label : ""}</span>
              <span className="sr-only">Previous letter</span>
            </button>
            <button type="button" disabled={idx >= cells.length - 1 && !glyphs[cell.id]} onClick={() => go(idx + 1, true)} className="flex h-11 items-center gap-2 rounded-xl bg-teal px-5 text-sm font-bold text-white hover:bg-teal-dark disabled:opacity-40" data-testid="next">
              {glyphs[cell.id] ? "Looks good, next" : "Skip, next"}
              <span lang="dv" className="font-thaana text-xl leading-none">{idx < cells.length - 1 ? cells[idx + 1].label : ""}</span>
              <span aria-hidden>→</span>
            </button>
          </div>
        </section>

      </main>
    </div>
  );
}
