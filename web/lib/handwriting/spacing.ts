import type { Ligature } from "./extras";
import { inkBox, markShift, offsetKey, shiftContours, type Offsets } from "./marks";
import type { Contour, Glyph } from "./types";

export const SPACE_ADVANCE = 280;
export const SIDE_MIN = -50;
export const SIDE_MAX = 100;
export const ALL_MIN = -100;
export const ALL_MAX = 200;
export const PAIR_STEP = 10;

export type Side = { left: number; right: number };
export type Spacing = {
  all: number;                          // added to every letter's width
  side: Record<string, Side>;           // extra space around one letter, by glyph id
  pairs: Record<string, number>;        // "firstId|secondId" in typing order -> change to the gap between the two
};

export const emptySpacing = (): Spacing => ({ all: 0, side: {}, pairs: {} });
export const pairKey = (first: string, second: string) => `${first}|${second}`;
const isMarkCp = (cp: number) => cp >= 0x07a6 && cp <= 0x07b0;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A letter with its own left and right space baked in: ink moved right by the left space, width grown by both. */
export function withSide(g: Glyph, sp: Spacing): Glyph {
  const s = sp.side[g.id];
  if (!s || g.kind === "fili" || (!s.left && !s.right)) return g;
  const moved: Contour[] = shiftContours(g.contours, { x: s.left, y: 0 });
  return { ...g, contours: moved, adv: g.adv + s.left + s.right };
}

/** What the builder receives: every glyph with its own space applied. The shared spacing goes in `spacing`. */
export function bake(glyphs: Glyph[], sp: Spacing): Glyph[] {
  return glyphs.map((g) => withSide(g, sp));
}

export type Line = {
  width: number;
  parts: { glyph: Glyph; x: number; y: number }[];
  letters: { id: string; x: number; adv: number; left: number; right: number }[];
};

/**
 * Lay out a right-to-left line from the person's own glyphs, the way the built font will: letters run from the right,
 * each mark sits on the letter before it, and a pair adjustment opens or closes the gap between its two letters.
 */
export function layoutLine(text: string, glyphs: Record<string, Glyph>, offsets: Offsets, sp: Spacing, ligatures: Ligature[] = []): Line {
  const byCp = new Map<number, Glyph>();
  for (const g of Object.values(glyphs)) if (g.contours.length) byCp.set(g.cp[0], g);
  type Item = { letter?: Glyph; marks: Glyph[]; adv: number; kern: number; lig?: boolean };
  const items: Item[] = [];
  let prev: Glyph | undefined;
  const cps = Array.from(text).map((ch) => ch.codePointAt(0)!);
  const ligs = ligatures.filter((l) => l.glyph.contours.length).sort((a, b) => b.sequence.length - a.sequence.length);
  const inWord = (cp: number | undefined) => cp !== undefined && cp >= 0x0780 && cp <= 0x07b0;
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    // a drawn letter combination stands in for its letters; it carries no vowel marks of its own after it
    const lig = ligs.find((l) =>
      l.sequence.every((c, k) => cps[i + k] === c) &&
      (l.when !== "start" || !inWord(cps[i - 1])) &&
      (l.when !== "end" || !inWord(cps[i + l.sequence.length])));
    if (lig) {
      items.push({ letter: lig.glyph, marks: [], adv: Math.max(0, lig.glyph.adv + sp.all), kern: 0, lig: true });
      prev = undefined;
      i += lig.sequence.length - 1;
      continue;
    }
    if (cp === 0x20) { items.push({ marks: [], adv: SPACE_ADVANCE, kern: 0 }); prev = undefined; continue; }
    const g = byCp.get(cp);
    if (isMarkCp(cp)) {
      const last = items[items.length - 1];
      if (g && last?.letter && !last.lig) last.marks.push(g);
      continue;
    }
    if (!g) { items.push({ marks: [], adv: 300, kern: 0 }); prev = undefined; continue; }
    const e = withSide(g, sp);
    const kern = prev ? sp.pairs[pairKey(prev.id, g.id)] ?? 0 : 0;
    items.push({ letter: e, marks: [], adv: Math.max(0, e.adv + sp.all), kern });
    prev = g;
  }
  const width = items.reduce((s, i) => s + i.adv + i.kern, 0);
  const parts: Line["parts"] = [];
  const letters: Line["letters"] = [];
  let pen = width;
  for (const it of items) {
    pen -= it.adv + it.kern;
    if (!it.letter) continue;
    parts.push({ glyph: it.letter, x: pen, y: 0 });
    const s = sp.side[it.letter.id] ?? { left: 0, right: 0 };
    letters.push({ id: it.letter.id, x: pen, adv: it.adv, left: s.left, right: s.right });
    for (const m of it.marks) {
      const sh = markShift(it.letter, m, offsets[offsetKey(it.letter.id, m.id)]);
      if (sh) parts.push({ glyph: m, x: pen + sh.x, y: sh.y });
    }
  }
  return { width, parts, letters };
}

/** Ink-to-ink distance between two neighbouring letters, in font units. */
export function gapBetween(first: Glyph, second: Glyph, sp: Spacing): number | null {
  const a = inkBox(withSide(first, sp)), b = inkBox(withSide(second, sp));
  if (!a || !b) return null;
  const advB = Math.max(0, withSide(second, sp).adv + sp.all);
  return advB + a.x0 - b.x1 + (sp.pairs[pairKey(first.id, second.id)] ?? 0);
}

/** Every pair of neighbouring letters (no marks) in a few words. */
export function pairsIn(texts: string[], glyphs: Record<string, Glyph>): [Glyph, Glyph][] {
  const byCp = new Map<number, Glyph>();
  for (const g of Object.values(glyphs)) if (g.contours.length && g.kind === "letter") byCp.set(g.cp[0], g);
  const seen = new Set<string>(), out: [Glyph, Glyph][] = [];
  for (const t of texts) {
    let prev: Glyph | undefined;
    for (const ch of Array.from(t)) {
      const cp = ch.codePointAt(0)!;
      if (isMarkCp(cp)) continue;
      const g = byCp.get(cp);
      if (prev && g) {
        const k = pairKey(prev.id, g.id);
        if (!seen.has(k)) { seen.add(k); out.push([prev, g]); }
      }
      prev = g;
    }
  }
  return out;
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Pairs whose gap is far from the usual gap, or that the person already adjusted. */
export function pairsToLookAt(texts: string[], glyphs: Record<string, Glyph>, sp: Spacing, tol = 70) {
  const pairs = pairsIn(texts, glyphs);
  const gaps = pairs.map(([a, b]) => gapBetween(a, b, sp));
  const usual = median(gaps.filter((g): g is number => g !== null));
  const out: { first: Glyph; second: Glyph; gap: number; value: number }[] = [];
  pairs.forEach(([first, second], i) => {
    const gap = gaps[i];
    const value = sp.pairs[pairKey(first.id, second.id)] ?? 0;
    if (gap === null) return;
    if (Math.abs(gap - usual) > tol || value !== 0) out.push({ first, second, gap, value });
  });
  return { rows: out.sort((x, y) => Math.abs(y.gap - usual) - Math.abs(x.gap - usual)), usual };
}

/** Give every letter the same space on each side, so the gaps look alike before pairs are fixed. */
export function evenOut(glyphs: Record<string, Glyph>, sp: Spacing): Spacing {
  const letters = Object.values(glyphs).filter((g) => g.kind === "letter" && g.contours.length);
  const bear = letters.map((g) => { const b = inkBox(g)!; return { g, l: b.x0, r: g.adv - b.x1 }; });
  const tl = median(bear.map((b) => b.l)), tr = median(bear.map((b) => b.r));
  const side: Spacing["side"] = {};
  for (const b of bear) {
    const left = clamp(Math.round(tl - b.l), SIDE_MIN, SIDE_MAX), right = clamp(Math.round(tr - b.r), SIDE_MIN, SIDE_MAX);
    if (left || right) side[b.g.id] = { left, right };
  }
  return { ...sp, side };
}
