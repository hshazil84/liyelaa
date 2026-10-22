"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExtrasNav } from "@/components/ExtrasNav";
import { GlyphEditor } from "@/components/GlyphEditor";
import { GlyphSvg } from "@/components/GlyphTile";
import { FontSwitcher } from "@/components/FontSwitcher";
import { Logo } from "@/components/Logo";
import { WordSvg } from "@/components/MarkViews";
import { Stepper } from "@/components/Stepper";
import { WHEN_LABEL, nextLigatureId, sequenceText, type Ligature, type When } from "@/lib/handwriting/extras";
import type { Offsets } from "@/lib/handwriting/marks";
import { layout } from "@/lib/handwriting/pipeline-layout";
import { JoinedSheetTools } from "@/components/JoinedSheetTools";
import { emptySpacing, type Spacing } from "@/lib/handwriting/spacing";
import { useSteps } from "@/lib/handwriting/steps";
import { loadProject, removeLigature, saveLigature, saveLigatures } from "@/lib/handwriting/store";
import type { Glyph, LayoutCell } from "@/lib/handwriting/types";

const PICK = [...layout.sheets[0].cells, ...layout.sheets[1].cells.filter((c) => c.kind === "fili")];
const MAX = 4;
const MARKS = layout.sheets[1].cells.filter((c) => c.kind === "fili");
const MARK_NAME: Record<string, string> = {
  "07A6": "abafili", "07A7": "aabaafili", "07A8": "ibifili", "07A9": "eebeefili", "07AA": "ubufili", "07AB": "ooboofili",
  "07AC": "ebefili", "07AD": "ebeefili", "07AE": "obofili", "07AF": "oboofili", "07B0": "sukun",
};
const LETTERS = layout.sheets[0].cells;
// letters most often joined with a sukun; only a starting guess, any of them can be unticked
const SUKUN_COMMON = new Set([0x0782, 0x078c, 0x078b, 0x0783, 0x078d, 0x0786, 0x0790, 0x078e, 0x0789, 0x0784, 0x0785]);
const SUKUN = 0x07b0;
const WHENS: When[] = ["always", "start", "end"];

const cellFor = (l: Ligature): LayoutCell => ({
  id: l.id, cp: l.sequence, kind: "letter", x: 0, y: 0, w: 0, h: 0, label: sequenceText(l.sequence), code: l.id,
});

export function LigaturesClient() {
  const steps = useSteps();
  const [glyphs, setGlyphs] = useState<Record<string, Glyph>>({});
  const [offsets, setOffsets] = useState<Offsets>({});
  const [sp, setSp] = useState<Spacing>(emptySpacing());
  const [ligs, setLigs] = useState<Ligature[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [seq, setSeq] = useState<number[]>([]);
  const [when, setWhen] = useState<When>("always");
  const [word, setWord] = useState("");
  const [mode, setMode] = useState<"mark" | "own">("mark");
  const [mark, setMark] = useState<number>(MARKS[0].cp[0]);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    loadProject().then((p) => {
      setGlyphs(p.glyphs);
      setOffsets(p.markOffsets ?? {});
      setSp(p.spacing ?? emptySpacing());
      setLigs(p.ligatures ?? []);
      setSelId(p.ligatures?.[0]?.id ?? null);
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((job: () => Promise<unknown>) => { queue.current = queue.current.then(job, job); }, []);
  const sel = ligs.find((l) => l.id === selId) ?? null;
  const has = (cp: number) => !!glyphs[cp.toString(16).toUpperCase().padStart(4, "0")]?.contours.length;
  const hasLetters = Object.values(glyphs).some((g) => g.kind === "letter" && g.contours.length);

  function add() {
    if (seq.length < 2) return;
    if (ligs.some((l) => l.sequence.join() === seq.join() && l.when === when)) {
      const same = ligs.find((l) => l.sequence.join() === seq.join() && l.when === when)!;
      setSelId(same.id);
      return;
    }
    const id = nextLigatureId(ligs);
    const l: Ligature = { id, sequence: seq, when, glyph: { id, cp: seq, kind: "letter", contours: [], adv: 600, source: "drawn" } };
    setLigs((p) => [...p, l]);
    persist(() => saveLigature(l));
    setSelId(id);
    setWord(sequenceText(seq));
    setSeq([]);
  }

  const have = (letter: number) => ligs.some((l) => l.sequence.length === 2 && l.sequence[0] === letter && l.sequence[1] === mark && l.when === when);
  const pending = LETTERS.map((c) => c.cp[0]).filter((cp) => ticked.has(cp) && !have(cp));

  function chooseMark(cp: number) {
    setMark(cp);
    setTicked(cp === SUKUN ? new Set(SUKUN_COMMON) : new Set());
  }

  function toggle(cp: number) {
    setTicked((t) => { const n = new Set(t); if (n.has(cp)) n.delete(cp); else n.add(cp); return n; });
  }

  function addMany() {
    if (!pending.length) return;
    let list = ligs;
    const made: Ligature[] = [];
    for (const cp of pending) {
      const id = nextLigatureId(list);
      const seq = [cp, mark];
      const l: Ligature = { id, sequence: seq, when, glyph: { id, cp: seq, kind: "letter", contours: [], adv: 600, source: "drawn" } };
      made.push(l);
      list = [...list, l];
    }
    setLigs(list);
    persist(() => saveLigatures(made));
    setSelId(made[0].id);
    setWord(sequenceText(made[0].sequence));
    setTicked(new Set());
  }

  /** Joined shapes read from a photo of the printed sheet. */
  function scanned(next: Ligature[]) {
    setLigs((p) => p.map((l) => next.find((n) => n.id === l.id) ?? l));
    persist(() => saveLigatures(next));
    setSelId(next[0].id);
    setWord(sequenceText(next[0].sequence));
  }

  function drawn(l: Ligature, g: Glyph | null) {
    const next = { ...l, glyph: g ?? { ...l.glyph, contours: [] } };
    setLigs((p) => p.map((x) => (x.id === l.id ? next : x)));
    persist(() => saveLigature(next));
  }

  function setWhenFor(l: Ligature, w: When) {
    const next = { ...l, when: w };
    setLigs((p) => p.map((x) => (x.id === l.id ? next : x)));
    persist(() => saveLigature(next));
  }

  function remove(l: Ligature) {
    const rest = ligs.filter((x) => x.id !== l.id);
    setLigs(rest);
    persist(() => removeLigature(l.id));
    if (selId === l.id) setSelId(rest[0]?.id ?? null);
  }

  const joined = useMemo(() => ligs, [ligs]);
  const text = word || (sel ? sequenceText(sel.sequence) : "");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white px-10 py-4">
        <div className="flex flex-wrap items-center gap-4"><Logo /><FontSwitcher /></div>
        <Stepper steps={steps} current={6} />
        <span className="hidden items-center gap-2 text-sm text-muted 2xl:flex"><span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser</span>
      </header>
      <ExtrasNav current="ligatures" />

      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-10 py-6">
        <section aria-label="Your joined letters" className="flex flex-wrap items-start gap-x-8 gap-y-4 rounded-3xl border border-line bg-white p-5">
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
            <h2 className="font-display text-lg font-bold">Your joined letters <span className="font-sans text-base font-medium text-muted" data-testid="lig-count">{ligs.length ? `(${ligs.length})` : ""}</span></h2>
            {ligs.length === 0 ? (
              <p className="text-sm text-muted">None yet. This step is optional, you can skip it.</p>
            ) : (
              <ul dir="rtl" className="flex max-h-[104px] flex-wrap gap-1.5 overflow-y-auto p-0.5" data-testid="lig-list">
                {ligs.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => { setSelId(l.id); setWord(sequenceText(l.sequence)); }}
                      aria-current={l.id === selId ? "true" : undefined}
                      aria-label={`${sequenceText(l.sequence)}, ${l.glyph.contours.length ? "drawn" : "not drawn yet"}`}
                      title={`${sequenceText(l.sequence)} · ${l.glyph.contours.length ? WHEN_LABEL[l.when] : "Not drawn yet"}`}
                      data-lig={l.id}
                      data-status={l.glyph.contours.length ? "drawn" : "missing"}
                      className={`flex h-11 w-11 items-center justify-center rounded-[10px] ${l.id === selId ? "border-[1.5px] border-coral bg-white" : l.glyph.contours.length ? "border border-[#CFE3D5] bg-teal-soft" : "border border-dashed border-[#BDCFC2] bg-[#F3F9F5]"}`}
                    >
                      {l.glyph.contours.length ? <GlyphSvg glyph={l.glyph} className="h-full w-full p-0.5" /> : <span lang="dv" className="font-thaana text-[20px] leading-none text-muted">{sequenceText(l.sequence)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-[260px]">
            <JoinedSheetTools ligs={ligs} onScanned={scanned} />
          </div>
        </section>

        <div className="flex flex-wrap items-start gap-6">
        <div className="flex w-full flex-col gap-4 lg:w-[340px]">
          <section aria-label="Pick letters" className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5">
            <h2 className="font-display text-xl font-bold">Add joined letters</h2>
            <div role="group" aria-label="Start from" className="flex flex-wrap gap-2">
              {([["mark", "A letter and a mark"], ["own", "Type my own"]] as const).map(([m, label]) => (
                <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} data-mode={m}
                  className={`h-10 rounded-full border px-4 text-sm font-bold ${mode === m ? "border-teal bg-teal text-white" : "border-[#BDCFC2] bg-white hover:bg-paper"}`}>{label}</button>
              ))}
            </div>
            {mode === "mark" && (
              <div className="flex flex-col gap-3" data-testid="common">
                <div>
                  <div className="mb-1.5 text-[13px] font-bold">1. Which mark?</div>
                  <div dir="rtl" className="grid grid-cols-6 gap-1">
                    {MARKS.map((m) => (
                      <button key={m.id} type="button" onClick={() => chooseMark(m.cp[0])} aria-pressed={mark === m.cp[0]} data-mark={m.id}
                        aria-label={`Mark ${MARK_NAME[m.id]}`}
                        className={`flex h-[52px] flex-col items-center justify-center rounded-[10px] border ${mark === m.cp[0] ? "border-[1.5px] border-edge bg-teal-soft" : "border-line bg-white hover:bg-paper"}`}>
                        <span lang="dv" className="font-thaana text-[18px] leading-[1.2]">{"\u0780" + m.label.replace("◌", "")}</span>
                        <small className="font-sans text-[8px] text-muted" dir="ltr">{MARK_NAME[m.id]}</small>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-bold">2. Which letters?</span>
                    <span className="flex gap-1.5">
                    <button type="button" onClick={() => setTicked(new Set(LETTERS.map((c) => c.cp[0]).filter((cp) => !have(cp))))} data-testid="tick-all" className="h-8 rounded-lg border border-[#BDCFC2] bg-white px-3 text-[13px] font-bold hover:bg-paper">Tick all {LETTERS.length}</button>
                    <button type="button" onClick={() => setTicked(new Set())} className="h-8 rounded-lg border border-[#BDCFC2] bg-white px-3 text-[13px] font-bold hover:bg-paper">Clear</button>
                    </span>
                  </div>
                  {mark === SUKUN && <p className="mb-1.5 text-[12px] text-muted">The ticked ones are a starting guess. Tick or untick any.</p>}
                  <div dir="rtl" className="grid grid-cols-8 gap-1" data-testid="common-grid">
                    {LETTERS.map((c) => {
                      const cp = c.cp[0], on = ticked.has(cp), done = have(cp);
                      return (
                        <button key={c.id} type="button" disabled={done} onClick={() => toggle(cp)} aria-pressed={on} data-letter={c.id}
                          aria-label={`${c.label}${String.fromCodePoint(mark)}${done ? ", already in your list" : ""}`}
                          className={`relative flex h-[38px] items-center justify-center rounded-lg border text-[18px] leading-none ${done ? "border-dashed border-[#BDCFC2] bg-[#F3F9F5] opacity-50" : on ? "border-[1.5px] border-edge bg-teal-soft" : "border-line bg-white hover:bg-paper"}`}>
                          <span lang="dv" className="font-thaana">{c.label + String.fromCodePoint(mark)}</span>
                          {on && <span aria-hidden className="absolute left-0.5 top-0 font-sans text-[8px] font-bold text-teal">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {mode === "own" && <p className="text-[13px] text-muted">Tap two to four letters or marks in the order you type them.</p>}
            <div dir="rtl" className={`grid grid-cols-7 gap-1 ${mode === "own" ? "" : "hidden"}`} data-testid="picker">
              {PICK.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={seq.length >= MAX}
                  onClick={() => setSeq((s) => [...s, c.cp[0]])}
                  aria-label={`Add ${c.label}${has(c.cp[0]) ? "" : ", not drawn yet"}`}
                  data-pick={c.id}
                  className={`flex h-10 items-center justify-center rounded-lg border text-[22px] leading-none disabled:opacity-40 ${has(c.cp[0]) ? "border-line bg-white hover:bg-paper" : "border-dashed border-[#BDCFC2] bg-[#F3F9F5] text-muted"}`}
                >
                  <span lang="dv" className="font-thaana">{c.label}</span>
                </button>
              ))}
            </div>
            <div className={`flex items-center justify-between gap-3 rounded-xl bg-[#F3F9F5] px-3 py-2 ${mode === "own" ? "" : "hidden"}`} dir="rtl">
              <span lang="dv" className="font-thaana text-[30px] leading-none" data-testid="sequence">{seq.length ? sequenceText(seq) : <span className="font-sans text-sm text-muted" dir="ltr">Tap two or more letters</span>}</span>
              <span className="flex gap-1" dir="ltr">
                <button type="button" disabled={!seq.length} onClick={() => setSeq((s) => s.slice(0, -1))} className="h-9 rounded-lg border border-[#BDCFC2] bg-white px-3 text-sm font-bold hover:bg-paper disabled:opacity-40">Undo</button>
              </span>
            </div>
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <legend className="sr-only">Where does it join?</legend>
              {WHENS.map((w) => (
                <label key={w} className="flex items-center gap-1.5 text-[13px]">
                  <input type="radio" name="when" checked={when === w} onChange={() => setWhen(w)} className="accent-teal" />
                  {WHEN_LABEL[w]}
                </label>
              ))}
            </fieldset>
            {mode === "own" ? (
              <button type="button" disabled={seq.length < 2} onClick={add} data-testid="add-lig" className="h-12 rounded-xl bg-teal text-[15px] font-bold text-white hover:bg-teal-dark disabled:opacity-40">
                Add joined letters
              </button>
            ) : (
              <button type="button" disabled={!pending.length} onClick={addMany} data-testid="add-many" className="h-12 rounded-xl bg-teal text-[15px] font-bold text-white hover:bg-teal-dark disabled:opacity-40">
                {pending.length ? `Add ${pending.length} joined letter${pending.length === 1 ? "" : "s"}` : "Tick letters to add"}
              </button>
            )}
          </section>

        </div>

        <section aria-label="Drawing area" className="flex min-w-0 flex-[1_1_480px] flex-col gap-4 rounded-3xl border border-line bg-white p-5">
          {sel ? (
            <>
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className="font-display text-xl font-bold" lang="dv"><span className="font-thaana text-[26px]">{sequenceText(sel.sequence)}</span></h1>
                <label className="flex items-center gap-2 text-sm text-muted">
                  Join
                  <select value={sel.when} onChange={(e) => setWhenFor(sel, e.target.value as When)} className="rounded-lg border border-[#BDCFC2] bg-white px-2 py-1 text-sm text-ink" aria-label="Where it joins">
                    {WHENS.map((w) => <option key={w} value={w}>{WHEN_LABEL[w]}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => remove(sel)} aria-label={`Remove ${sequenceText(sel.sequence)}`} className="ml-auto h-9 rounded-lg border border-[#BDCFC2] bg-white px-3 text-sm font-bold hover:bg-paper">Remove this one</button>
              </div>
              <p className="text-[13px] text-muted">Draw the whole joined shape, including any vowel marks that belong to it.</p>
              <GlyphEditor key={sel.id} cell={cellFor(sel)} glyph={sel.glyph.contours.length ? sel.glyph : null} original={null} onChange={(g) => drawn(sel, g)} />
            </>
          ) : loaded && (
            <div className="flex flex-col gap-2 py-10 text-center">
              <h1 className="font-display text-xl font-bold">No joined letters yet</h1>
              <p className="mx-auto max-w-[44ch] text-[15px] text-muted">Pick a mark and tick letters on the left, then add them. If your letters already look right side by side, you do not need this step.</p>
            </div>
          )}
        </section>

        <aside aria-label="Preview" className="flex w-full flex-col gap-4 lg:w-[320px]">
          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5">
            <h2 className="font-display text-lg font-bold">Preview</h2>
            {sel && hasLetters ? (
              <>
                <input
                  value={text}
                  onChange={(e) => setWord(e.target.value)}
                  dir="rtl"
                  lang="dv"
                  aria-label="Try a word"
                  className="h-11 rounded-xl border border-[#BDCFC2] bg-white px-3 font-thaana text-xl"
                />
                <div className="flex flex-col gap-1 rounded-[14px] bg-[#F3F9F5] px-4 py-3" dir="rtl">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted" dir="ltr">Joined</span>
                  <WordSvg text={text} glyphs={glyphs} offsets={offsets} spacing={sp} ligatures={joined} height={72} label="Joined" />
                  <span className="mt-1 text-[11px] font-bold uppercase tracking-wide text-muted" dir="ltr">Apart</span>
                  <WordSvg text={text} glyphs={glyphs} offsets={offsets} spacing={sp} height={72} label="Apart" />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">Add a joined shape and draw it to see it next to the plain letters.</p>
            )}
          </div>
          <Link href="/handwriting/export" data-testid="continue-export" className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal text-base font-bold text-white hover:bg-teal-dark">
            Continue to test and export <span aria-hidden>→</span>
          </Link>
        </aside>
        </div>
      </main>
    </div>
  );
}
