"use client";

import Link from "next/link";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/Icon";
import { useEffect, useMemo, useState } from "react";
import { FontSwitcher } from "@/components/FontSwitcher";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import { applyLevel, moveOne, NUDGE, planLevel, type Levelled, type LevelMethod } from "@/lib/handwriting/level";
import { shiftContours } from "@/lib/handwriting/marks";
import { layout } from "@/lib/handwriting/pipeline";
import { stepIndex, useSteps } from "@/lib/handwriting/steps";
import { loadProject, saveLevelled } from "@/lib/handwriting/store";
import { contoursToD } from "@/lib/handwriting/svg";
import { UNITS_PER_MM, type Glyph } from "@/lib/handwriting/types";

const LETTERS = layout.sheets[0].cells.filter((c) => c.kind === "letter");

/** One letter on its own baseline: grey is where it was drawn, dark is where it will sit. Click it to work on that letter alone. */
function LevelCell({ glyph, from, to, label, selected, byHand, onPick }: { glyph: Glyph; from: number; to: number; label: string; selected: boolean; byHand: boolean; onPick: () => void }) {
  const w = Math.max(glyph.adv + 80, 300);
  const drawn = shiftContours(glyph.contours, { x: 0, y: -from });
  const placed = shiftContours(glyph.contours, { x: 0, y: to - from });
  const moved = Math.abs(to - from) >= 2 || Math.abs(to) >= 2;
  const state = Math.abs(to - from) >= 2 ? "will move" : Math.abs(to) >= 2 ? "snapped" : "not moved";
  return (
    <li data-letter={glyph.id} data-moved={moved ? "1" : "0"} data-hand={byHand ? "1" : "0"} className="relative">
      <button
        type="button" onClick={onPick} aria-pressed={selected} data-testid="level-tile"
        aria-label={`${label}, ${state}${byHand ? ", moved by hand" : ""}`}
        className={`flex w-full flex-col items-center gap-0.5 rounded-xl border bg-white p-1.5 ${selected ? "border-[1.5px] border-[#FA7E00]" : "border-line hover:bg-paper"}`}
      >
        <svg viewBox={`-40 -540 ${w} 920`} className="h-[84px] w-full" aria-hidden>
          <line x1={-40} x2={w - 40} y1={0} y2={0} stroke="#264022" strokeWidth={5} />
          <g transform="scale(1,-1)">
            {moved && <path d={contoursToD(drawn)} fill="#CBD9CF" fillRule="nonzero" />}
            <path d={contoursToD(placed)} fill="#264022" fillRule="nonzero" />
          </g>
        </svg>
        <span className="text-[10px] font-bold text-muted">{byHand ? "nudged" : state}</span>
      </button>
      {byHand && <span aria-hidden className="pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-[#FA7E00]" />}
    </li>
  );
}

export function LevelClient() {
  const steps = useSteps();
  const [glyphs, setGlyphs] = useState<Record<string, Glyph>>({});
  const [levelled, setLevelled] = useState<Levelled>({});
  const [strength, setStrength] = useState(100);
  const [method, setMethod] = useState<LevelMethod>("baseline");
  const [hand, setHand] = useState<Levelled>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasTails, setHasTails] = useState(false);

  useEffect(() => {
    loadProject().then((p) => {
      setHasTails(Boolean(p.tails && p.tails.style !== "off"));
      setGlyphs(p.glyphs); setLevelled(p.levelled ?? {}); setHand(p.levelHand ?? {});
      if (p.levelMethod) setMethod(p.levelMethod);
      setLoaded(true);
    });
  }, []);

  const drawn = useMemo(() => LETTERS.filter((c) => glyphs[c.id]?.contours.length), [glyphs]);
  const plan = useMemo(() => planLevel(glyphs, levelled, strength / 100, method, hand), [glyphs, levelled, strength, method, hand]);
  const applied = Object.keys(levelled).length > 0;
  const same = drawn.every((c) => (plan.moves[c.id]?.to ?? 0) === (levelled[c.id] ?? 0));
  const nudged = Object.keys(hand).filter((id) => hand[id] && glyphs[id]);
  const pickedCell = picked ? drawn.find((c) => c.id === picked) : undefined;

  async function store(g: Record<string, Glyph>, l: Levelled, h: Levelled, m: LevelMethod) {
    setGlyphs(g); setLevelled(l); setHand(h);
    await saveLevelled(g, l, { hand: h, method: m });
  }

  /** Snap every letter. Letters you nudged by hand keep their nudge. */
  async function commit() {
    const next = applyLevel(glyphs, plan);
    await store(next.glyphs, next.levelled, hand, method);
  }

  /** Put every letter back where it was drawn, nudges included. */
  async function undoAll() {
    const next = applyLevel(glyphs, planLevel(glyphs, levelled, 0, method, {}));
    await store(next.glyphs, next.levelled, {}, method);
  }

  /** Snap just this letter (dropping its nudge), put it back, or nudge it a quarter millimetre from where it will sit. */
  async function one(id: string, what: "snap" | "back" | "up" | "down") {
    const mine = hand[id] ?? 0;
    const auto = (plan.moves[id]?.to ?? 0) - mine;
    const step = what === "up" ? NUDGE : what === "down" ? -NUDGE : 0;
    const to = what === "back" ? 0 : what === "snap" ? auto : auto + mine + step;
    const h = { ...hand };
    if (what === "up" || what === "down") h[id] = mine + step; else delete h[id];
    if (!h[id]) delete h[id];
    const next = moveOne(glyphs, levelled, id, to);
    await store(next.glyphs, next.levelled, h, method);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="z-30 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white lg:sticky lg:top-0 px-10 py-4">
        <div className="flex flex-wrap items-center gap-4"><Logo /><FontSwitcher /></div>
        <Stepper steps={steps} current={stepIndex(steps, "/handwriting/level", 3)} />
        <span className="hidden items-center gap-2 text-sm text-muted 2xl:flex">
          <span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1240px] flex-wrap items-start gap-6 px-10 py-8">
        <section aria-label="Level the letters" className="flex min-w-0 flex-[1_1_700px] flex-col gap-5 rounded-3xl border border-line bg-white p-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-[32px] font-bold leading-[1.1]">Level your letters</h1>
            <p className="text-[15px] text-muted">
              Hand-drawn letters drift above and below the line. Snap puts each one where AK Rasmee puts it, scaled to your writing size.
              Letters only move up or down. They are never resized or redrawn. Click a letter to move just that one.
            </p>
          </div>

          {hasTails && (
            <p role="status" data-testid="tails-notice" className="rounded-xl bg-sand px-4 py-3 text-sm">
              Cursive tails are on. A tail can pull a letter off the line when it snaps, so for the cleanest result turn them off first on the{" "}
              <Link href="/handwriting/tails" className="font-bold text-teal underline underline-offset-4">Tails step</Link>, snap, then turn them back on.
            </p>
          )}
          {loaded && !drawn.length ? (
            <p role="status" className="rounded-xl bg-sand px-4 py-3 text-sm">
              Draw or photograph some letters first.{" "}
              <Link href="/handwriting" className="font-bold text-teal underline underline-offset-4">Add a photo</Link>.
            </p>
          ) : (
            <>
              <ul dir="rtl" className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2" data-testid="level-grid">
                {drawn.map((c) => (
                  <LevelCell key={c.id} glyph={glyphs[c.id]} from={plan.moves[c.id]?.from ?? 0} to={plan.moves[c.id]?.to ?? 0} label={c.label}
                    selected={picked === c.id} byHand={Boolean(hand[c.id])} onPick={() => setPicked(picked === c.id ? null : c.id)} />
                ))}
              </ul>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#CBD9CF]" />Where you drew it</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink" />Where it will sit</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-teal" />Baseline</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#FA7E00]" />Moved by hand</span>
              </p>
            </>
          )}
        </section>

        <aside className="flex w-full min-w-[280px] flex-[0_1_340px] flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-3xl border border-line bg-white p-6">
            <h2 className="font-display text-xl font-bold">Snap to the baseline</h2>
            <div role="radiogroup" aria-label="Snap by" className="flex flex-col gap-2">
              {([
                ["baseline", "Body on the baseline", "Best for letters you wrote on the line. Dots and tails do not pull the letter off it.", true],
                ["middle", "Middle of the letter", "Lines up the middle of all the ink.", false],
              ] as const).map(([id, name, note, rec]) => (
                <label key={id} data-testid={`method-${id}`} className={`flex cursor-pointer items-start gap-2.5 rounded-2xl border px-3 py-2.5 ${method === id ? "border-[1.5px] border-[#8FA894] bg-teal-soft" : "border-line"}`}>
                  <input type="radio" name="method" checked={method === id} onChange={() => setMethod(id)} className="mt-1 accent-teal" />
                  <span className="text-sm"><b className="block">{name}{rec && <span className="ml-1.5 rounded-full bg-sand px-2 py-0.5 align-[1px] text-[11px]">Recommended</span>}</b><span className="text-xs text-muted">{note}</span></span>
                </label>
              ))}
            </div>
            <label className="flex flex-col gap-2 text-sm font-medium">
              <span className="flex justify-between"><span>Strength</span><span className="text-muted" data-testid="strength-value">{strength}%</span></span>
              <input type="range" min={0} max={100} step={5} value={strength} onChange={(e) => setStrength(Number(e.target.value))} data-testid="strength" aria-label="Strength" className="accent-teal" />
              <span className="text-xs font-normal text-muted">100% puts every letter on the line. Lower keeps some of your own wobble.</span>
            </label>
            <p className="rounded-xl bg-[#F3F9F5] px-3 py-2.5 text-[13px] leading-relaxed" data-testid="level-summary">
              {plan.moved} of {drawn.length} letters {applied && same ? "are snapped" : "will move"}{nudged.length ? `, ${nudged.length} moved by hand` : ""}. Biggest move {(plan.biggest / UNITS_PER_MM).toFixed(1)} mm.
            </p>
            <div className="flex gap-2">
              <button type="button" data-testid="snap" disabled={!drawn.length || same} onClick={() => void commit()}
                className="h-12 flex-1 rounded-xl bg-teal text-[15px] font-bold text-white hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-40">
                Snap letters
              </button>
              <button type="button" data-testid="undo-snap" disabled={!applied && !nudged.length} onClick={() => void undoAll()}
                className="h-12 rounded-xl border border-[#BDCFC2] px-4 text-[15px] font-bold hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40">
                Undo all
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-6" data-testid="one-letter">
            <h2 className="font-display text-xl font-bold">This letter</h2>
            {pickedCell ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" data-testid="nudge-up" onClick={() => void one(pickedCell.id, "up")} aria-label="Nudge up" className="h-9 rounded-xl border border-[#BDCFC2] px-3 text-sm font-bold hover:bg-paper">▲ Up</button>
                  <button type="button" data-testid="nudge-down" onClick={() => void one(pickedCell.id, "down")} aria-label="Nudge down" className="h-9 rounded-xl border border-[#BDCFC2] px-3 text-sm font-bold hover:bg-paper">▼ Down</button>
                  <span className="text-[13px] text-muted" data-testid="hand-amount">
                    {hand[pickedCell.id] ? `${Math.abs(hand[pickedCell.id] / UNITS_PER_MM).toFixed(2)} mm ${hand[pickedCell.id] > 0 ? "up" : "down"} by hand` : "Not moved by hand"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button type="button" data-testid="snap-one" onClick={() => void one(pickedCell.id, "snap")}
                    disabled={(levelled[pickedCell.id] ?? 0) === (plan.moves[pickedCell.id]?.to ?? 0) - (hand[pickedCell.id] ?? 0) && !hand[pickedCell.id]}
                    className="h-9 rounded-xl bg-teal px-3 text-sm font-bold text-white hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-40">Snap this one</button>
                  <button type="button" data-testid="put-back" onClick={() => void one(pickedCell.id, "back")} disabled={!(levelled[pickedCell.id] ?? 0)}
                    className="h-9 rounded-xl border border-[#BDCFC2] px-3 text-sm font-bold hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40">Put back</button>
                </div>
                <p className="text-xs text-muted">Put back returns it to where you drew it. Each nudge moves it {(NUDGE / UNITS_PER_MM).toFixed(2)} mm, and it stays when you snap all.</p>
              </>
            ) : (
              <p className="text-sm text-muted">Click a letter to snap, put back or nudge just that one.</p>
            )}
          </div>
          <Link href="/handwriting/tails" data-testid="continue-tails"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal text-base font-bold text-white hover:bg-teal-dark">
            Add cursive tails <Icon icon={ArrowRight02Icon} size={18} />
          </Link>
          <Link href="/handwriting/letters" className="text-center text-sm font-bold text-teal underline underline-offset-4">Back to clean up</Link>
        </aside>
      </main>
    </div>
  );
}
