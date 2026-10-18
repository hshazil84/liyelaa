"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Composed, WordSvg } from "@/components/MarkViews";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import { layout } from "@/lib/handwriting/pipeline";
import {
  autoAnchor, checkPair, inkBox, isBelow, markShift, offsetKey, shiftContours, type Offset, type Offsets,
} from "@/lib/handwriting/marks";
import { emptySpacing, type Spacing } from "@/lib/handwriting/spacing";
import { HANDWRITING_STEPS } from "@/lib/handwriting/steps";
import { loadProject, saveMarkOffsets } from "@/lib/handwriting/store";
import { contoursToD } from "@/lib/handwriting/svg";
import type { Glyph } from "@/lib/handwriting/types";

const LETTERS = layout.sheets[0].cells.filter((c) => c.kind === "letter");
const MARKS = layout.sheets[1].cells.filter((c) => c.kind === "fili");
const WORDS = ["ދިވެހިބަސް", "ދިވެހިރާއްޖެ"];
const STEP = 4;          // font units per nudge; hold Shift for four times as much
const WHY = { overlaps: "Touches the letter", far: "Too far away", missing: "Missing" } as const;

const key = (l: Glyph, m: Glyph) => offsetKey(l.id, m.id);

export function AnchorsClient() {
  const [glyphs, setGlyphs] = useState<Record<string, Glyph>>({});
  const [offsets, setOffsets] = useState<Offsets>({});
  const [spacing, setSpacing] = useState<Spacing>(emptySpacing());
  const [loaded, setLoaded] = useState(false);
  const [letterId, setLetterId] = useState<string>(LETTERS[0].id);
  const [markId, setMarkId] = useState<string>(MARKS[0].id);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ from: { x: number; y: number }; start: Offset } | null>(null);

  useEffect(() => {
    loadProject().then((p) => {
      setGlyphs(p.glyphs);
      setOffsets(p.markOffsets ?? {});
      setSpacing(p.spacing ?? emptySpacing());
      const l = LETTERS.find((c) => p.glyphs[c.id]?.contours.length);
      const m = MARKS.find((c) => p.glyphs[c.id]?.contours.length);
      if (l) setLetterId(l.id);
      if (m) setMarkId(m.id);
      setLoaded(true);
    });
  }, []);

  const drawn = (id: string) => !!glyphs[id]?.contours.length;
  const letters = useMemo(() => LETTERS.filter((c) => drawn(c.id)), [glyphs]); // eslint-disable-line react-hooks/exhaustive-deps
  const marks = useMemo(() => MARKS.filter((c) => drawn(c.id)), [glyphs]);       // eslint-disable-line react-hooks/exhaustive-deps
  const letter = glyphs[letterId]?.contours.length ? glyphs[letterId] : undefined;
  const mark = glyphs[markId]?.contours.length ? glyphs[markId] : undefined;

  const persist = useCallback((next: Offsets) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveMarkOffsets(next); }, 250);
  }, []);

  const setOffset = useCallback((l: Glyph, m: Glyph, o: Offset | null) => {
    setOffsets((prev) => {
      const next = { ...prev };
      if (!o || (o.dx === 0 && o.dy === 0)) delete next[key(l, m)];
      else next[key(l, m)] = { dx: Math.round(o.dx), dy: Math.round(o.dy) };
      persist(next);
      return next;
    });
  }, [persist]);

  const current: Offset = (letter && mark && offsets[key(letter, mark)]) || { dx: 0, dy: 0 };
  const nudge = (dx: number, dy: number, big: boolean) => {
    if (!letter || !mark) return;
    const k = big ? 4 : 1;
    setOffset(letter, mark, { dx: current.dx + dx * STEP * k, dy: current.dy + dy * STEP * k });
  };

  // ---- every letter and mark pair, checked: the list on the right
  const deferred = useDeferredValue(offsets);
  const flagged = useMemo(() => {
    const out: { l: Glyph; m: Glyph; why: keyof typeof WHY }[] = [];
    let total = 0;
    for (const lc of letters) for (const mc of marks) {
      const l = glyphs[lc.id], m = glyphs[mc.id];
      total++;
      const c = checkPair(l, m, deferred[key(l, m)]);
      if (!c.ok && c.why) out.push({ l, m, why: c.why });
    }
    return { out, total };
  }, [letters, marks, glyphs, deferred]);

  // ---- the editor canvas
  const lb = letter ? inkBox(letter) : null;
  const auto = letter && mark ? autoAnchor(letter, mark) : null;
  const other = letter && mark ? autoAnchor(letter, { ...mark, cp: [isBelow(mark) ? 0x07a6 : 0x07aa] }) : null;
  const dot = auto ? { x: auto.x + current.dx, y: auto.y + current.dy } : null;
  const shift = letter && mark ? markShift(letter, mark, current) : null;
  const adv = letter ? Math.max(letter.adv, 420) : 500;
  const vb = { x: -160, y: -780, w: adv + 320, h: 1180 };

  const toFont = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: -p.y };
  };

  const check = letter && mark ? checkPair(letter, mark, current) : null;
  const pending = loaded && (!letters.length || !marks.length);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white px-10 py-4">
        <Logo />
        <Stepper steps={HANDWRITING_STEPS} current={3} />
        <span className="flex items-center gap-2 text-sm text-muted">
          <span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1240px] flex-wrap items-start gap-6 px-10 py-8">
        <section aria-label="Vowel mark editor" className="flex min-w-0 flex-[1_1_560px] flex-col gap-5 rounded-3xl border border-line bg-white p-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-[32px] font-bold leading-[1.1]">Place the vowel marks</h1>
            <p className="text-[15px] text-muted">
              Each mark snaps to the top or bottom of the letter. Every letter is a little different, so drag the dot only where a mark looks wrong.
            </p>
          </div>

          {pending ? (
            <p role="status" className="rounded-xl bg-sand px-4 py-3 text-sm">
              You need at least one letter and one vowel mark first.{" "}
              <Link href="/handwriting/letters" className="font-bold text-teal underline underline-offset-4">Go back to your letters</Link>.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <span id="letter-label" className="text-sm font-medium">Letter</span>
                <div role="radiogroup" aria-labelledby="letter-label" className="flex flex-wrap gap-1.5">
                  {letters.map((c) => {
                    const on = c.id === letterId;
                    const bad = marks.some((m) => flagged.out.some((f) => f.l.id === c.id && f.m.id === m.id));
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={`Letter ${c.label}${bad ? ", needs a look" : ""}`}
                        data-letter={c.id}
                        onClick={() => setLetterId(c.id)}
                        className={`flex h-11 w-11 items-center justify-center rounded-[10px] ${on ? "border-2 border-coral bg-white" : bad ? "border border-coral bg-coral-soft" : "border border-line bg-white hover:bg-paper"}`}
                      >
                        <Composed letter={glyphs[c.id]} className="h-full w-full p-0.5" />
                      </button>
                    );
                  })}
                  <span className="flex h-11 items-center px-3 text-sm text-muted">{letters.length} drawn</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span id="mark-label" className="text-sm font-medium">Vowel mark</span>
                <div role="radiogroup" aria-labelledby="mark-label" className="flex flex-wrap gap-1.5">
                  {marks.map((c) => {
                    const on = c.id === markId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={`Vowel mark ${c.label}`}
                        data-mark={c.id}
                        onClick={() => setMarkId(c.id)}
                        className={`flex h-[52px] w-[52px] items-center justify-center rounded-[10px] ${on ? "border-2 border-coral bg-white" : "border border-line bg-white hover:bg-paper"}`}
                      >
                        {letter ? <Composed letter={letter} mark={glyphs[c.id]} offset={offsets[offsetKey(letter.id, c.id)]} className="h-full w-full p-0.5" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[18px] bg-[#F3F6F5] p-2">
                <svg
                  ref={svgRef}
                  viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
                  className="h-[360px] w-full touch-none select-none"
                  role="img"
                  aria-label={letter && mark ? `Letter ${LETTERS.find((c) => c.id === letter.id)?.label} with its vowel mark` : "Vowel mark editor"}
                  data-testid="anchor-canvas"
                >
                  <g transform="scale(1,-1)">
                    {lb && (
                      <>
                        <line x1={vb.x} x2={vb.x + vb.w} y1={lb.y1} y2={lb.y1} stroke="#B6C2BF" strokeWidth={3} strokeDasharray="14 10" />
                        <line x1={vb.x} x2={vb.x + vb.w} y1={lb.y0} y2={lb.y0} stroke="#B6C2BF" strokeWidth={3} strokeDasharray="14 10" />
                      </>
                    )}
                    <line x1={vb.x} x2={vb.x + vb.w} y1={0} y2={0} stroke="#0B6B63" strokeWidth={4} />
                    {letter && <path d={contoursToD(letter.contours)} fill="#10211F" fillRule="nonzero" />}
                    {letter && mark && shift && (
                      <path d={contoursToD(shiftContours(mark.contours, shift))} fill={check && !check.ok ? "#D9482B" : "#10211F"} fillRule="nonzero" data-testid="placed-mark" />
                    )}
                    {other && <circle cx={other.x} cy={other.y} r={14} fill="#fff" stroke="#B6C2BF" strokeWidth={4} />}
                  </g>
                  {/* the dot is drawn in screen space (not flipped) so its label reads normally */}
                  {dot && (
                    <g
                      transform={`translate(${dot.x} ${-dot.y})`}
                      tabIndex={0}
                      role="slider"
                      aria-label={`${mark && isBelow(mark) ? "Below" : "Above"} anchor`}
                      aria-valuetext={`${current.dx} across, ${current.dy} up`}
                      data-testid="anchor-dot"
                      className="cursor-grab outline-none focus-visible:[&>circle]:stroke-ink"
                      onPointerDown={(e) => {
                        (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
                        drag.current = { from: toFont(e), start: current };
                      }}
                      onPointerMove={(e) => {
                        if (!drag.current || !letter || !mark) return;
                        const p = toFont(e);
                        setOffset(letter, mark, { dx: drag.current.start.dx + p.x - drag.current.from.x, dy: drag.current.start.dy + p.y - drag.current.from.y });
                      }}
                      onPointerUp={() => { drag.current = null; }}
                      onKeyDown={(e) => {
                        const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
                        if (d[e.key]) { e.preventDefault(); nudge(d[e.key][0], d[e.key][1], e.shiftKey); }
                      }}
                    >
                      <circle r={30} fill="transparent" />
                      <circle r={16} fill="#D9482B" stroke="#fff" strokeWidth={5} />
                      <text x={34} y={-26} fontSize={34} fontWeight={700} fill="#10211F" paintOrder="stroke" stroke="#F3F6F5" strokeWidth={8}>
                        {mark && isBelow(mark) ? "Below anchor" : "Above anchor"}
                      </text>
                    </g>
                  )}
                  <text x={vb.x + 14} y={lb ? -lb.y1 - 14 : 0} fontSize={32} fill="#5A6B68">Above marks</text>
                  <text x={vb.x + 14} y={-14} fontSize={32} fontWeight={700} fill="#0B6B63">Baseline</text>
                  <text x={vb.x + 14} y={lb ? -lb.y0 + 40 : 0} fontSize={32} fill="#5A6B68">Below marks</text>
                </svg>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2" role="group" aria-label="Nudge">
                  <span className="mr-1 text-sm text-muted">Nudge</span>
                  {([["Left", -1, 0, "M10 3L5 8l5 5"], ["Up", 0, 1, "M3 10l5-5 5 5"], ["Down", 0, -1, "M3 6l5 5 5-5"], ["Right", 1, 0, "M6 3l5 5-5 5"]] as const).map(([n, dx, dy, d]) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`Nudge ${n.toLowerCase()}`}
                      onClick={(e) => nudge(dx, dy, e.shiftKey)}
                      className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#B6C2BF] bg-white hover:bg-paper"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#10211F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  {check && <span className={`text-sm ${check.ok ? "text-teal" : "text-coral"}`} role="status">{check.ok ? "Looks right" : WHY[check.why!]}</span>}
                  <button
                    type="button"
                    disabled={!letter || !mark || (current.dx === 0 && current.dy === 0)}
                    onClick={() => letter && mark && setOffset(letter, mark, null)}
                    className="h-11 rounded-xl border border-[#B6C2BF] bg-white px-4 text-[15px] font-bold hover:bg-paper disabled:opacity-40"
                  >
                    Reset to auto
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <aside aria-label="Checks" className="flex w-full flex-col gap-5 lg:w-[320px]">
          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl font-bold">Needs a look</h2>
              <span className="text-sm tabular-nums text-muted" data-testid="flag-count">{flagged.out.length} of {flagged.total}</span>
            </div>
            <p className="text-sm leading-normal text-muted">
              {letters.length} letters × {marks.length} marks. These combinations touch the letter or sit too far from it.
            </p>
            {flagged.out.length === 0 ? (
              <p className="rounded-xl bg-teal-soft px-3 py-2.5 text-sm text-teal-dark">Nothing to fix. Every mark sits on its letter.</p>
            ) : (
              <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto" data-testid="flagged">
                {flagged.out.slice(0, 40).map(({ l, m, why }) => (
                  <li key={key(l, m)} className="flex items-center justify-between gap-2 rounded-xl bg-[#F3F6F5] py-1.5 pl-3 pr-2.5">
                    <span className="flex items-center gap-2">
                      <Composed letter={l} mark={m} offset={offsets[key(l, m)]} className="h-12 w-12" />
                      <span className="text-[13px] text-muted">{WHY[why]}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => { setLetterId(l.id); setMarkId(m.id); }}
                      className="h-9 rounded-[10px] border border-[#B6C2BF] bg-white px-3 text-sm font-bold hover:bg-paper"
                    >
                      Fix
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5">
            <h2 className="font-display text-xl font-bold">Real words</h2>
            <div className="flex flex-col items-start gap-1 overflow-hidden rounded-[14px] bg-[#F3F6F5] p-3" dir="rtl">
              {WORDS.map((w) => (
                <WordSvg key={w} text={w} glyphs={glyphs} offsets={deferred} spacing={spacing} height={72} />
              ))}
            </div>
            <p className="text-[13px] leading-snug text-muted">Letters you have not drawn are left blank here.</p>
          </div>

          <Link
            href="/handwriting/spacing"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal text-base font-bold text-white hover:bg-teal-dark"
          >
            Continue to spacing <span aria-hidden>→</span>
          </Link>
        </aside>
      </main>
    </div>
  );
}
