"use client";

import Link from "next/link";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/Icon";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FontSwitcher } from "@/components/FontSwitcher";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import { shiftContours } from "@/lib/handwriting/marks";
import { layout } from "@/lib/handwriting/pipeline";
import { stepIndex, useSteps } from "@/lib/handwriting/steps";
import { loadProject, saveTails } from "@/lib/handwriting/store";
import { contoursToD } from "@/lib/handwriting/svg";
import { applyTails, EXTRA_MAX, EXTRA_STEP, LEN_MAX, NAMES, PRESETS, emptyTails, type TailSettings, type TailStyle } from "@/lib/handwriting/tails";
import { UNITS_PER_MM, type Glyph } from "@/lib/handwriting/types";

const LETTERS = layout.sheets[0].cells.filter((c) => c.kind === "letter");
const STYLES: TailStyle[] = ["off", "long", "flick", "joined"];
const NOTES: Record<TailStyle, string> = {
  off: "Letters stay as you traced them.",
  long: "The last stroke runs on and tapers to a fine point.",
  flick: "A shorter tail that lifts at the end, like a pen leaving the page.",
  joined: "The tail reaches toward the next letter so a word reads as one line.",
};
const mm = (u: number) => (Math.round((u / UNITS_PER_MM) * 10) / 10).toString();

/** One letter on its own baseline: grey is how it was traced, dark is the letter with its tail. */
function TailCell({ base, now, label, has, selected, hand, onPick }: { base: Glyph; now: Glyph; label: string; has: boolean; selected: boolean; hand: boolean; onPick: () => void }) {
  const w = Math.max(base.adv + 80, 300);
  return (
    <li data-letter={base.id} data-tail={has ? "1" : "0"} data-hand={hand ? "1" : "0"} className="relative">
      <button
        type="button" onClick={onPick} aria-pressed={selected} data-testid="tail-tile"
        aria-label={`${label}, ${has ? "has a tail" : "no tail"}${hand ? ", changed by hand" : ""}`}
        className={`flex w-full flex-col items-center gap-0.5 rounded-xl border bg-white p-1.5 ${selected ? "border-[1.5px] border-[#FA7E00]" : "border-line hover:bg-paper"}`}
      >
        <svg viewBox={`-230 -540 ${w + 190} 920`} className="h-[84px] w-full" aria-hidden>
          <line x1={-230} x2={w - 40} y1={0} y2={0} stroke="#264022" strokeWidth={5} />
          <g transform="scale(1,-1)">
            {has && <path d={contoursToD(base.contours)} fill="#CBD9CF" fillRule="nonzero" />}
            <path d={contoursToD(now.contours)} fill="#264022" fillRule="nonzero" />
          </g>
        </svg>
        <span className="text-[10px] font-bold text-muted">{hand ? "by hand" : has ? "tail" : "no tail"}</span>
      </button>
      {hand && <span aria-hidden className="pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-[#FA7E00]" />}
    </li>
  );
}

export function TailsClient() {
  const steps = useSteps();
  const [base, setBase] = useState<Record<string, Glyph>>({});
  const [s, setS] = useState<TailSettings>(emptyTails());
  const [lev, setLev] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const touched = useRef(false);
  const seq = useRef(0);

  useEffect(() => {
    loadProject().then((p) => {
      // each letter as it was before any tail, moved by whatever Level has done since
      const b: Record<string, Glyph> = {};
      for (const c of LETTERS) {
        const g = p.tailBase?.[c.id] ?? p.glyphs[c.id];
        if (!g || !g.contours.length) continue;
        const d = p.tailBase?.[c.id] ? (p.levelled?.[c.id] ?? 0) - (p.tailLev?.[c.id] ?? 0) : 0;
        b[c.id] = d ? { ...g, contours: shiftContours(g.contours, { x: 0, y: d }) } : g;
      }
      setBase(b); setLev(p.levelled ?? {});
      if (p.tails) setS({ ...p.tails, extra: p.tails.extra ?? {}, off: p.tails.off ?? {} });
      setLoaded(true);
    });
  }, []);

  const later = useDeferredValue(s);
  const out = useMemo(() => applyTails(base, later), [base, later]);
  const ids = Object.keys(base);
  const tipped = new Set(out.tipped);
  const handIds = ids.filter((id) => s.extra[id] || s.off?.[id]);
  const pickedCell = picked ? LETTERS.find((c) => c.id === picked && base[c.id]) : undefined;
  const joined = s.style === "joined";

  // keep the saved letters in step with what is on screen, a moment after the last change
  useEffect(() => {
    if (!loaded || !touched.current) return;
    const mine = ++seq.current;
    const t = setTimeout(() => {
      if (mine !== seq.current) return;
      if (later.style === "off") void saveTails(out.glyphs, null, null, null);
      else void saveTails(out.glyphs, later, base, lev);
    }, 350);
    return () => clearTimeout(t);
  }, [loaded, later, out, base, lev]);

  const change = (next: TailSettings) => { touched.current = true; setS(next); };
  const pickStyle = (st: TailStyle) => change({ ...s, ...PRESETS[st], extra: s.extra, off: s.off });
  const slide = (k: "len" | "cur" | "hook" | "tap", v: number) => {
    const from = s.style === "off" ? PRESETS.long : s;           // moving a slider with no style chosen starts from the long sweep
    change({ ...s, style: from.style, len: from.len, cur: from.cur, hook: from.hook, tap: from.tap, [k]: v });
  };
  const byHand = (id: string, what: "longer" | "shorter" | "none" | "back") => {
    const extra = { ...s.extra }, off = { ...(s.off ?? {}) };
    if (what === "longer") extra[id] = Math.min(EXTRA_MAX, (extra[id] ?? 0) + EXTRA_STEP);
    if (what === "shorter") extra[id] = Math.max(-EXTRA_MAX, (extra[id] ?? 0) - EXTRA_STEP);
    if (what === "none") off[id] = true;
    if (what === "back") { delete extra[id]; delete off[id]; }
    if (!extra[id]) delete extra[id];
    change({ ...s, extra, off });
  };
  const undoAll = () => { touched.current = true; setS(emptyTails()); setPicked(null); };

  const slider = (k: "len" | "cur" | "hook" | "tap", name: string, min: number, max: number, step: number, shown: string, disabled = false) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      <span className="flex justify-between"><span>{name}</span><span className="text-muted" data-testid={`tail-${k}-value`}>{shown}</span></span>
      <input type="range" min={min} max={max} step={step} value={s[k]} disabled={disabled || s.style === "off"} aria-label={name} data-testid={`tail-${k}`}
        onChange={(e) => slide(k, Number(e.target.value))} className="accent-teal disabled:opacity-40" />
    </label>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="z-30 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white lg:sticky lg:top-0 px-4 sm:px-10 py-4">
        <div className="flex flex-wrap items-center gap-4"><Logo /><FontSwitcher /></div>
        <Stepper steps={steps} current={stepIndex(steps, "/handwriting/tails", 4)} />
        <span className="hidden items-center gap-2 text-sm text-muted 2xl:flex">
          <span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1240px] flex-wrap items-start gap-6 px-4 sm:px-10 py-8">
        <section aria-label="Cursive tails" className="flex min-w-0 flex-[1_1_700px] flex-col gap-5 rounded-3xl border border-line bg-white p-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-[32px] font-bold leading-[1.1]">Cursive tails</h1>
            <p className="text-[15px] text-muted">
              The last stroke of a letter, the part that trails off to the left, can run on in a flowing line. Pick a style and shape it.
              Grey is the letter as you traced it, dark is the letter with its tail. Only the tail changes. Click a letter to change just that one.
            </p>
          </div>

          {loaded && !ids.length ? (
            <p role="status" className="rounded-xl bg-sand px-4 py-3 text-sm">
              Draw or photograph some letters first.{" "}
              <Link href="/handwriting" className="font-bold text-teal underline underline-offset-4">Add a photo</Link>.
            </p>
          ) : (
            <>
              <ul dir="rtl" className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2" data-testid="tail-grid">
                {LETTERS.filter((c) => base[c.id]).map((c) => (
                  <TailCell key={c.id} base={base[c.id]} now={out.glyphs[c.id] ?? base[c.id]} label={c.label} has={tipped.has(c.id)}
                    selected={picked === c.id} hand={Boolean(s.extra[c.id] || s.off?.[c.id])} onPick={() => setPicked(picked === c.id ? null : c.id)} />
                ))}
              </ul>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#CBD9CF]" />As you traced it</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink" />With its tail</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-teal" />Baseline</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#FA7E00]" />Changed by hand</span>
              </p>
            </>
          )}
        </section>

        <aside className="flex w-full min-w-[280px] flex-[0_1_340px] flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-3xl border border-line bg-white p-6">
            <h2 className="font-display text-xl font-bold">Tail style</h2>
            <div role="radiogroup" aria-label="Tail style" className="flex flex-wrap gap-1.5">
              {STYLES.map((st) => (
                <button key={st} type="button" role="radio" aria-checked={s.style === st} data-testid={`style-${st}`} onClick={() => pickStyle(st)}
                  className={`h-9 rounded-full border px-3.5 text-[13px] font-bold ${s.style === st ? "border-ink bg-ink text-white" : "border-[#BDCFC2] hover:bg-paper"}`}>
                  {NAMES[st]}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">{NOTES[s.style]}</p>
            {slider("len", "Length", 0, LEN_MAX, 4, joined ? "Reaches the next letter" : `${mm(s.len)} mm`, joined)}
            {slider("cur", "Curve", -50, 100, 5, String(s.cur))}
            {slider("hook", "Flick at the end", 0, 100, 5, `${s.hook}%`, joined)}
            {slider("tap", "Taper to a point", 0, 100, 5, `${s.tap}%`)}
            <p className="rounded-xl bg-[#F3F9F5] px-3 py-2.5 text-[13px] leading-relaxed" data-testid="tail-summary">
              {s.style === "off"
                ? "No tails yet. Pick a style."
                : `${out.tipped.length} of ${ids.length} letters have a tail.${out.skipped.length ? ` ${out.skipped.length} have no end stroke to carry on and stay as traced.` : ""}${handIds.length ? ` ${handIds.length} changed by hand.` : ""}`}
            </p>
            <button type="button" data-testid="undo-tails" disabled={s.style === "off" && !handIds.length} onClick={undoAll}
              className="h-12 rounded-xl border border-[#BDCFC2] px-4 text-[15px] font-bold hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40">
              Undo all tails
            </button>
          </div>

          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-6" data-testid="tail-one">
            <h2 className="font-display text-xl font-bold">This letter</h2>
            {pickedCell ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" data-testid="tail-shorter" onClick={() => byHand(pickedCell.id, "shorter")} disabled={s.style === "off"}
                    className="h-9 rounded-xl border border-[#BDCFC2] px-3 text-sm font-bold hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40">Shorter</button>
                  <button type="button" data-testid="tail-longer" onClick={() => byHand(pickedCell.id, "longer")} disabled={s.style === "off"}
                    className="h-9 rounded-xl border border-[#BDCFC2] px-3 text-sm font-bold hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40">Longer</button>
                  <button type="button" data-testid="tail-none" onClick={() => byHand(pickedCell.id, "none")} disabled={s.style === "off"}
                    className="h-9 rounded-xl border border-[#BDCFC2] px-3 text-sm font-bold hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40">No tail</button>
                  <button type="button" data-testid="tail-back" onClick={() => byHand(pickedCell.id, "back")} disabled={!(s.extra[pickedCell.id] || s.off?.[pickedCell.id])}
                    className="h-9 rounded-xl border border-[#BDCFC2] px-3 text-sm font-bold hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40">Use the style</button>
                </div>
                <p className="text-[13px] text-muted" data-testid="tail-hand">
                  {s.off?.[pickedCell.id] ? "No tail on this letter."
                    : s.extra[pickedCell.id] ? `${s.extra[pickedCell.id] > 0 ? "+" : "−"}${mm(Math.abs(s.extra[pickedCell.id]))} mm from the style.`
                    : tipped.has(pickedCell.id) ? "Using the style above." : "This letter has no end stroke to carry on."}
                </p>
                <p className="text-xs text-muted">Each press changes the length by {mm(EXTRA_STEP)} mm. Use the style puts it back in step with the others.</p>
              </>
            ) : (
              <p className="text-sm text-muted">Click a letter to make its tail longer or shorter, or to leave it without one.</p>
            )}
          </div>

          <Link href="/handwriting/anchors" data-testid="continue-anchors"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal text-base font-bold text-white hover:bg-teal-dark">
            Place the vowel marks <Icon icon={ArrowRight02Icon} size={18} />
          </Link>
          <Link href="/handwriting/level" className="text-center text-sm font-bold text-teal underline underline-offset-4">Back to level</Link>
        </aside>
      </main>
    </div>
  );
}
