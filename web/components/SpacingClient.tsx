"use client";

import Link from "next/link";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/Icon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExtrasNav } from "@/components/ExtrasNav";
import { WordSvg } from "@/components/MarkViews";
import { GlyphSvg } from "@/components/GlyphTile";
import { FontSwitcher } from "@/components/FontSwitcher";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import type { Offsets } from "@/lib/handwriting/marks";
import { layout } from "@/lib/handwriting/pipeline";
import {
  ALL_MAX, ALL_MIN, PAIR_STEP, SIDE_MAX, SIDE_MIN, emptySpacing, evenOut, pairKey, pairsToLookAt, type Spacing,
} from "@/lib/handwriting/spacing";
import { stepIndex, useSteps } from "@/lib/handwriting/steps";
import { loadProject, saveSpacing } from "@/lib/handwriting/store";
import type { Glyph } from "@/lib/handwriting/types";

const WORDS = ["ދިވެހިބަސް", "ދިވެހިރާއްޖެ", "ގައުމީ މަޖިލިސް"];
const LABELS = new Map(layout.sheets[0].cells.map((c) => [c.id, c.label]));
const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

function Range({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm font-medium">
        <label htmlFor={id}>{label}</label>
        <span className="tabular-nums text-muted" data-testid={`${id}-value`}>{sign(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function SpacingClient() {
  const steps = useSteps();
  const [glyphs, setGlyphs] = useState<Record<string, Glyph>>({});
  const [offsets, setOffsets] = useState<Offsets>({});
  const [sp, setSp] = useState<Spacing>(emptySpacing());
  const [loaded, setLoaded] = useState(false);
  const [sel, setSel] = useState("0784");
  const [gaps, setGaps] = useState(true);
  const [size, setSize] = useState(104);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadProject().then((p) => {
      setGlyphs(p.glyphs);
      setOffsets(p.markOffsets ?? {});
      setSp(p.spacing ?? emptySpacing());
      const first = layout.sheets[0].cells.find((c) => p.glyphs[c.id]?.contours.length);
      if (first) setSel(first.id);
      setLoaded(true);
    });
  }, []);

  const update = useCallback((fn: (s: Spacing) => Spacing) => {
    setSp((prev) => {
      const next = fn(prev);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void saveSpacing(next); }, 250);
      return next;
    });
  }, []);

  const letter = glyphs[sel]?.contours.length ? glyphs[sel] : undefined;
  const side = sp.side[sel] ?? { left: 0, right: 0 };
  const setSide = (k: "left" | "right", v: number) =>
    update((s) => {
      const cur = s.side[sel] ?? { left: 0, right: 0 };
      const next = { ...cur, [k]: v };
      const sides = { ...s.side };
      if (!next.left && !next.right) delete sides[sel]; else sides[sel] = next;
      return { ...s, side: sides };
    });
  const setPair = (a: string, b: string, v: number) =>
    update((s) => {
      const pairs = { ...s.pairs };
      if (v === 0) delete pairs[pairKey(a, b)]; else pairs[pairKey(a, b)] = v;
      return { ...s, pairs };
    });

  const look = useMemo(() => pairsToLookAt(WORDS, glyphs, sp), [glyphs, sp]);
  const pending = loaded && !Object.values(glyphs).some((g) => g.kind === "letter" && g.contours.length);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="z-30 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white lg:sticky lg:top-0 px-10 py-4">
        <div className="flex flex-wrap items-center gap-4"><Logo /><FontSwitcher /></div>
        <Stepper steps={steps} current={stepIndex(steps, "/handwriting/spacing", 6)} />
        <span className="hidden items-center gap-2 text-sm text-muted 2xl:flex">
          <span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser
        </span>
      </header>

      <ExtrasNav current="spacing" />
      <main className="mx-auto flex w-full max-w-[1240px] flex-wrap items-start gap-6 px-10 py-8">
        <div className="flex w-full flex-col gap-6 lg:w-[320px]">
          <section aria-label="Letter spacing" className="flex flex-col gap-[18px] rounded-3xl border border-line bg-white p-5">
            <div className="flex items-center gap-3.5">
              <div className="flex h-16 w-16 items-center justify-center rounded-[14px] border-[1.5px] border-coral">
                {letter ? <GlyphSvg glyph={letter} className="h-full w-full p-1" /> : <span className="text-muted">–</span>}
              </div>
              <div className="flex flex-col gap-0.5">
                <h2 className="font-display text-xl font-semibold">Space around <span lang="dv" className="font-thaana text-2xl" data-testid="sel-label">{LABELS.get(sel)}</span></h2>
                <span className="text-[13px] text-muted">Pick another letter in the preview</span>
              </div>
            </div>
            <Range id="left" label="Left space" value={side.left} min={SIDE_MIN} max={SIDE_MAX} onChange={(v) => setSide("left", v)} />
            <Range id="right" label="Right space" value={side.right} min={SIDE_MIN} max={SIDE_MAX} onChange={(v) => setSide("right", v)} />
            <Range id="all" label="All letters" value={sp.all} min={ALL_MIN} max={ALL_MAX} onChange={(v) => update((s) => ({ ...s, all: v }))} />
            <label className="flex items-center gap-2.5 text-sm font-medium">
              <input type="checkbox" checked={gaps} onChange={(e) => setGaps(e.target.checked)} className="h-[18px] w-[18px] accent-teal" />
              Show the gaps
            </label>
            <button
              type="button"
              onClick={() => update((s) => evenOut(glyphs, s))}
              className="h-11 rounded-xl border border-[#BDCFC2] bg-white text-[15px] font-bold hover:bg-paper"
            >
              Even out all letters
            </button>
          </section>

          <section aria-label="Pairs" className="flex flex-col gap-3.5 rounded-3xl border border-line bg-white p-5">
            <h2 className="font-display text-xl font-semibold">Pairs to look at</h2>
            <p className="text-sm leading-normal text-muted">Pairs that look too far apart or too close. Nudge each one closer or further.</p>
            {look.rows.length === 0 ? (
              <p className="rounded-xl bg-teal-soft px-3 py-2.5 text-sm text-teal-dark">All the pairs in these words are evenly spaced.</p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="pairs">
                {look.rows.slice(0, 8).map(({ first, second, gap, value }) => {
                  const k = pairKey(first.id, second.id);
                  return (
                    <li key={k} data-pair={k} className="flex items-center justify-between gap-2 rounded-xl bg-[#F3F9F5] py-2 pl-3.5 pr-2.5">
                      <span className="flex items-center gap-2">
                        <WordSvg text={String.fromCodePoint(first.cp[0], second.cp[0])} glyphs={glyphs} offsets={offsets} spacing={sp} height={44} />
                        <span className="text-xs text-muted">{gap > look.usual ? "far" : "close"}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <button type="button" aria-label={`Move ${LABELS.get(first.id)}${LABELS.get(second.id)} closer`} onClick={() => setPair(first.id, second.id, value - PAIR_STEP)} className="h-9 w-9 rounded-[10px] border border-[#BDCFC2] bg-white text-lg hover:bg-paper">−</button>
                        <span className="w-9 text-center text-sm font-bold tabular-nums">{sign(value)}</span>
                        <button type="button" aria-label={`Move ${LABELS.get(first.id)}${LABELS.get(second.id)} further`} onClick={() => setPair(first.id, second.id, value + PAIR_STEP)} className="h-9 w-9 rounded-[10px] border border-[#BDCFC2] bg-white text-lg hover:bg-paper">+</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Link
            href="/handwriting/extras"
            data-testid="continue-extras"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal text-base font-bold text-white hover:bg-teal-dark"
          >
            Next: signs and punctuation <Icon icon={ArrowRight02Icon} size={18} />
          </Link>
        </div>

        <section aria-label="Preview" className="flex min-w-0 flex-[1_1_480px] flex-col gap-4 rounded-3xl border border-line bg-white p-6">
          <h1 className="font-display text-[32px] font-bold leading-[1.1]">Preview and space the letters</h1>
          <p className="text-[15px] text-muted">Look for gaps that are too big or too small, then fix them on the left. Click a letter to choose it.</p>
          {pending ? (
            <p role="status" className="rounded-xl bg-sand px-4 py-3 text-sm">
              Nothing to space yet. <Link href="/handwriting/letters" className="font-bold text-teal underline underline-offset-4">Go back to your letters</Link>.
            </p>
          ) : (
            <div className="flex flex-col items-start gap-2 overflow-x-auto rounded-[14px] bg-[#F3F9F5] px-7 py-4" dir="rtl">
              {WORDS.map((w, i) => (
                <WordSvg key={w} text={w} glyphs={glyphs} offsets={offsets} spacing={sp} height={size * (i === 0 ? 1 : 0.7)}>
                  {(line) => (
                    <>
                      {line.letters.map((l, j) => {
                        const on = l.id === sel;
                        return (
                          <g key={j}>
                            {gaps && on && l.left > 0 && <rect x={l.x} y={-200} width={l.left} height={900} fill="#264022" opacity={0.18} />}
                            {gaps && on && l.right > 0 && <rect x={l.x + l.adv - sp.all - l.right} y={-200} width={l.right} height={900} fill="#264022" opacity={0.18} />}
                            {gaps && on && <rect x={l.x} y={-200} width={l.adv} height={900} fill="none" stroke="#FA7E00" strokeWidth={5} strokeDasharray="16 10" />}
                            <rect x={l.x} y={-200} width={l.adv} height={900} fill="transparent" className="cursor-pointer" data-letter={l.id} onClick={() => setSel(l.id)} />
                          </g>
                        );
                      })}
                    </>
                  )}
                </WordSvg>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 text-sm text-muted">
            <label htmlFor="size" className="w-9">Size</label>
            <input id="size" type="range" min={24} max={160} value={size} onChange={(e) => setSize(Number(e.target.value))} className="max-w-[320px] flex-1" />
          </div>
        </section>
      </main>
    </div>
  );
}
