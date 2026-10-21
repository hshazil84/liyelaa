"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import { applyLevel, planLevel, type Levelled } from "@/lib/handwriting/level";
import { shiftContours } from "@/lib/handwriting/marks";
import { layout } from "@/lib/handwriting/pipeline";
import { useSteps } from "@/lib/handwriting/steps";
import { loadProject, saveLevelled } from "@/lib/handwriting/store";
import { contoursToD } from "@/lib/handwriting/svg";
import { UNITS_PER_MM, type Glyph } from "@/lib/handwriting/types";

const LETTERS = layout.sheets[0].cells.filter((c) => c.kind === "letter");

/** One letter on its own baseline: grey is where it was drawn, dark is where it will sit. */
function LevelCell({ glyph, from, to, label }: { glyph: Glyph; from: number; to: number; label: string }) {
  const w = Math.max(glyph.adv + 80, 300);
  const drawn = shiftContours(glyph.contours, { x: 0, y: -from });
  const placed = shiftContours(glyph.contours, { x: 0, y: to - from });
  const moved = Math.abs(to - from) >= 2 || Math.abs(to) >= 2;
  return (
    <li data-letter={glyph.id} data-moved={moved ? "1" : "0"} className="flex flex-col items-center gap-1 rounded-xl border border-line bg-white p-1.5">
      <svg viewBox={`-40 -540 ${w} 920`} className="h-[84px] w-full" role="img" aria-label={`${label}, ${to === 0 ? "not moved" : to > 0 ? "moved up" : "moved down"}`}>
        <line x1={-40} x2={w - 40} y1={0} y2={0} stroke="#0B6B63" strokeWidth={5} />
        <g transform="scale(1,-1)">
          {moved && <path d={contoursToD(drawn)} fill="#C5CFCC" fillRule="nonzero" />}
          <path d={contoursToD(placed)} fill="#10211F" fillRule="nonzero" />
        </g>
      </svg>
    </li>
  );
}

export function LevelClient() {
  const steps = useSteps();
  const [glyphs, setGlyphs] = useState<Record<string, Glyph>>({});
  const [levelled, setLevelled] = useState<Levelled>({});
  const [strength, setStrength] = useState(100);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadProject().then((p) => { setGlyphs(p.glyphs); setLevelled(p.levelled ?? {}); setLoaded(true); });
  }, []);

  const drawn = useMemo(() => LETTERS.filter((c) => glyphs[c.id]?.contours.length), [glyphs]);
  const plan = useMemo(() => planLevel(glyphs, levelled, strength / 100), [glyphs, levelled, strength]);
  const applied = Object.keys(levelled).length > 0;
  const same = drawn.every((c) => (plan.moves[c.id]?.to ?? 0) === (levelled[c.id] ?? 0));

  async function commit(s: number) {
    const next = applyLevel(glyphs, planLevel(glyphs, levelled, s));
    setGlyphs(next.glyphs); setLevelled(next.levelled);
    await saveLevelled(next.glyphs, next.levelled);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white px-10 py-4">
        <Logo />
        <Stepper steps={steps} current={3} />
        <span className="flex items-center gap-2 text-sm text-muted">
          <span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1240px] flex-wrap items-start gap-6 px-10 py-8">
        <section aria-label="Level the letters" className="flex min-w-0 flex-[1_1_700px] flex-col gap-5 rounded-3xl border border-line bg-white p-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-[32px] font-bold leading-[1.1]">Level your letters</h1>
            <p className="text-[15px] text-muted">
              Hand-drawn letters drift above and below the line. Snap puts each one where AK Rasmee puts it, scaled to your writing size.
              Letters only move up or down. They are never resized or redrawn.
            </p>
          </div>

          {loaded && !drawn.length ? (
            <p role="status" className="rounded-xl bg-sand px-4 py-3 text-sm">
              Draw or photograph some letters first.{" "}
              <Link href="/handwriting" className="font-bold text-teal underline underline-offset-4">Add a photo</Link>.
            </p>
          ) : (
            <>
              <ul dir="rtl" className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2" data-testid="level-grid">
                {drawn.map((c) => (
                  <LevelCell key={c.id} glyph={glyphs[c.id]} from={plan.moves[c.id]?.from ?? 0} to={plan.moves[c.id]?.to ?? 0} label={c.label} />
                ))}
              </ul>
              <p className="flex items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#C5CFCC]" />Where you drew it</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink" />Where it will sit</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-teal" />Baseline</span>
              </p>
            </>
          )}
        </section>

        <aside className="flex w-full min-w-[280px] flex-[0_1_340px] flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-3xl border border-line bg-white p-6">
            <h2 className="font-display text-xl font-bold">Snap to the baseline</h2>
            <label className="flex flex-col gap-2 text-sm font-medium">
              <span className="flex justify-between"><span>Strength</span><span className="text-muted" data-testid="strength-value">{strength}%</span></span>
              <input type="range" min={0} max={100} step={5} value={strength} onChange={(e) => setStrength(Number(e.target.value))} data-testid="strength" aria-label="Strength" className="accent-teal" />
              <span className="text-xs font-normal text-muted">100% puts every letter on the line. Lower keeps some of your own wobble.</span>
            </label>
            <p className="rounded-xl bg-[#F3F6F5] px-3 py-2.5 text-[13px] leading-relaxed" data-testid="level-summary">
              {plan.moved} of {drawn.length} letters {applied && same ? "are snapped" : "will move"}. Biggest move {(plan.biggest / UNITS_PER_MM).toFixed(1)} mm.
            </p>
            <div className="flex gap-2">
              <button type="button" data-testid="snap" disabled={!drawn.length || same} onClick={() => void commit(strength / 100)}
                className="h-12 flex-1 rounded-xl bg-teal text-[15px] font-bold text-white hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-40">
                Snap letters
              </button>
              <button type="button" data-testid="undo-snap" disabled={!applied} onClick={() => void commit(0)}
                className="h-12 rounded-xl border border-[#B6C2BF] px-4 text-[15px] font-bold hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40">
                Undo
              </button>
            </div>
          </div>
          <Link href="/handwriting/anchors" data-testid="continue-anchors"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal text-base font-bold text-white hover:bg-teal-dark">
            Place the vowel marks <span aria-hidden>→</span>
          </Link>
          <Link href="/handwriting/letters" className="text-center text-sm font-bold text-teal underline underline-offset-4">Back to clean up</Link>
        </aside>
      </main>
    </div>
  );
}
