"use client";

import Link from "next/link";
import { ArrowLeft02Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/Icon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlyphEditor } from "@/components/GlyphEditor";
import { GlyphSvg } from "@/components/GlyphTile";
import { FontSwitcher } from "@/components/FontSwitcher";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import { ALPHABET_CELLS } from "@/lib/handwriting/alphabet";
import { layout } from "@/lib/handwriting/pipeline";
import { stepIndex, useSteps } from "@/lib/handwriting/steps";
import { loadProject, removeGlyph, updateGlyph } from "@/lib/handwriting/store";
import type { Glyph, LayoutCell } from "@/lib/handwriting/types";
import { KeyHint } from "@/components/KeyHint";

type TabId = "letters" | "marks" | "extras" | "alphabet";

const SHEET2 = layout.sheets[1].cells;
const TABS: { id: TabId; label: string; cells: LayoutCell[] }[] = [
  { id: "letters", label: "Letters", cells: layout.sheets[0].cells },
  { id: "marks", label: "Vowel marks", cells: SHEET2.filter((c) => c.kind === "fili") },
  { id: "extras", label: "Extras", cells: SHEET2.filter((c) => c.kind === "symbol") },
  { id: "alphabet", label: "Alphabet", cells: ALPHABET_CELLS },
];

/** A letter's name as text: Thaana in its own face, English in the page's. */
function Name({ cell, className = "" }: { cell: LayoutCell; className?: string }) {
  return cell.kind === "latin" ? <span className={className}>{cell.label}</span> : <span lang="dv" className={`font-thaana ${className}`}>{cell.label}</span>;
}

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
        <Name cell={cell} className="text-[22px] leading-none text-muted" />
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="z-30 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white lg:sticky lg:top-0 px-4 sm:px-10 py-4">
        <div className="flex flex-wrap items-center gap-4"><Logo /><FontSwitcher /></div>
        <Stepper steps={steps} current={stepIndex(steps, "/handwriting/letters", 2)} />
        <span className="hidden items-center gap-2 text-sm text-muted 2xl:flex">
          <span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1280px] flex-wrap items-start gap-6 px-4 sm:px-10 py-8">
        <div className="flex w-full flex-col gap-4 lg:w-[360px]">
        <section aria-label="Letters" className="flex w-full flex-col gap-4 rounded-3xl border border-line bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-bold">{TABS.find((t) => t.id === tab)!.label}</h2>
            <span className="text-sm text-muted" data-testid="progress">{doneCount} of {cells.length} {drawn ? "drawn" : "cleaned up"}</span>
          </div>
          <div className="h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-teal" style={{ width: `${(doneCount / cells.length) * 100}%` }} /></div>
          <div role="tablist" aria-label="Which letters" className="flex flex-wrap gap-x-0.5 gap-y-1 font-medium">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => { setTab(t.id); setSelId(t.cells[0].id); }}
                className={`rounded-full px-1.5 py-1.5 text-[12px] min-[420px]:px-2 min-[420px]:text-[13px] sm:px-2.5 sm:text-sm ${tab === t.id ? "bg-ink text-white" : "text-muted hover:bg-paper"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div dir={tab === "alphabet" ? "ltr" : "rtl"} className="grid grid-cols-6 justify-between gap-1.5" data-testid="grid">
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
          <p className="border-t border-line pt-3 text-sm text-muted">
            {drawn ? (
              <>Have SVG files already? <Link href="/draw" className="font-bold text-teal underline underline-offset-4" data-testid="bring-svg">Bring in SVG files</Link></>
            ) : (
              <>Missing letters? <Link href="/handwriting" className="font-bold text-teal underline underline-offset-4" data-testid="add-photo">Add a photo of your sheet</Link></>
            )}
          </p>
        </section>
          <div className="flex flex-col gap-2 rounded-3xl bg-lilac-soft p-5">
            <h2 className="font-display text-base font-bold text-grape">Keep it on the guides</h2>
            <p className="text-sm leading-normal">{tab === "alphabet" ? "Capitals reach the cap line. Small letters reach the x-height line. Letters like g, p and y can drop below the baseline." : "Draw between Top and Baseline so vowel marks have room above and below."}</p>
          </div>
        </div>

        <section aria-label="Drawing area" className="flex min-w-0 flex-[1_1_520px] flex-col gap-4 rounded-3xl border border-line bg-white p-5">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-xl font-bold"><Name cell={cell} className="text-[26px]" /></h1>
            <span className="text-sm text-muted">U+{cell.id}</span>
            {cell.kind !== "latin" && <KeyHint cp={parseInt(cell.id, 16)} />}
          </div>
          {loaded && (
            <GlyphEditor
              key={`${tab}-${cell.id}`}
              cell={cell}
              glyph={glyphs[cell.id] ?? null}
              original={originals[cell.id] ?? null}
              onChange={(g) => onChange(cell.id, g)}
              below={
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2 sm:flex-wrap sm:gap-3">
                    <button type="button" disabled={idx <= 0} onClick={() => go(idx - 1, false)} className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-[#BDCFC2] px-4 text-sm font-bold hover:bg-paper disabled:opacity-40">
                      <Icon icon={ArrowLeft02Icon} size={18} />
                      {idx > 0 && <Name cell={cells[idx - 1]} className="text-xl leading-none" />}
                      <span className="sr-only">Previous letter</span>
                    </button>
                    <button type="button" disabled={idx >= cells.length - 1 && !glyphs[cell.id]} onClick={() => go(idx + 1, true)} className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-teal px-3 sm:min-w-[200px] sm:flex-none sm:px-5 text-sm font-bold text-white hover:bg-teal-dark disabled:opacity-40" data-testid="next">
                      {glyphs[cell.id] ? "Looks good, next" : "Skip, next"}
                      {idx < cells.length - 1 && <Name cell={cells[idx + 1]} className="text-xl leading-none" />}
                      <Icon icon={ArrowRight02Icon} size={18} />
                    </button>
                  </div>
                  <p className="whitespace-nowrap text-center text-sm text-muted sm:text-right">
                    <span className="sm:hidden">Done? </span><span className="hidden sm:inline">Done with the letters? </span>
                    <Link href="/handwriting/level" data-testid="level-here" className="font-bold text-teal underline underline-offset-4">Level the letters →</Link>
                  </p>
                </div>
              }
            />
          )}
        </section>

      </main>
    </div>
  );
}
