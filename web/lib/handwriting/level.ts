import { inkBox, shiftContours } from "./marks";
import { REFERENCE } from "./reference";
import { UNITS_PER_MM, type Glyph } from "./types";

/** How far each letter has been moved so far, in font units (positive is up). Kept so a snap can be undone exactly. */
export type Levelled = Record<string, number>;

const SCALE_MIN = 0.6, SCALE_MAX = 3;

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** How big the person writes compared with the reference: the typical ratio of their letter height to AK Rasmee's. */
export function writingScale(glyphs: Record<string, Glyph>): number {
  const r: number[] = [];
  for (const [id, ref] of Object.entries(REFERENCE)) {
    const b = glyphs[id] && glyphs[id].contours.length ? inkBox(glyphs[id]) : null;
    if (b && ref[1] > ref[0]) r.push((b.y1 - b.y0) / (ref[1] - ref[0]));
  }
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, median(r) || 1));
}

/** How a letter's place is found. "baseline" puts the bottom of the body where AK Rasmee puts it, so dots and long strokes do not pull it off the line. "middle" lines up the middle of all the ink. */
export type LevelMethod = "baseline" | "middle";

/** Letters whose reference ink reaches this far below the line (font units) hang under it, so the bottom is not a steady guide and the middle is used. */
export const HANGS_BELOW = -90;

/** One step of the nudge buttons: a quarter of a millimetre. */
export const NUDGE = Math.round(UNITS_PER_MM / 4);

export type LevelPlan = { scale: number; moves: Record<string, { from: number; to: number }>; moved: number; biggest: number };

/**
 * Where each letter should sit, nothing resized.
 * baseline: the bottom of the ink goes to the scaled reference bottom. Letters that hang below the line use the middle instead.
 * middle: the middle of the ink goes to the middle of the reference ink, scaled to the person's own writing size.
 * `from` is the move already applied, `to` is the move wanted at this strength, plus any nudge the person made by hand.
 */
export function planLevel(glyphs: Record<string, Glyph>, levelled: Levelled, strength: number, method: LevelMethod = "baseline", hand: Levelled = {}): LevelPlan {
  const scale = writingScale(glyphs);
  const moves: LevelPlan["moves"] = {};
  let moved = 0, biggest = 0;
  for (const [id, ref] of Object.entries(REFERENCE)) {
    const g = glyphs[id];
    const b = g && g.contours.length ? inkBox(g) : null;
    if (!b) continue;
    const from = levelled[id] ?? 0;
    const byBottom = method === "baseline" && ref[0] >= HANGS_BELOW;
    const full = byBottom
      ? scale * ref[0] - (b.y0 - from)                                          // the bottom, where it was drawn before any snap
      : (scale * (ref[0] + ref[1])) / 2 - ((b.y0 + b.y1) / 2 - from);           // the middle, where it was drawn before any snap
    const to = Math.round(full * strength) + (hand[id] ?? 0);
    moves[id] = { from, to };
    if (Math.abs(to) >= 2) moved++;
    biggest = Math.max(biggest, Math.abs(to));
  }
  return { scale, moves, moved, biggest };
}

/** The letters with the plan applied. */
export function applyLevel(glyphs: Record<string, Glyph>, plan: LevelPlan): { glyphs: Record<string, Glyph>; levelled: Levelled } {
  const out: Record<string, Glyph> = { ...glyphs };
  const levelled: Levelled = {};
  for (const [id, m] of Object.entries(plan.moves)) {
    const d = m.to - m.from;
    if (d !== 0) out[id] = { ...glyphs[id], contours: shiftContours(glyphs[id].contours, { x: 0, y: d }) };
    if (m.to !== 0) levelled[id] = m.to;
  }
  return { glyphs: out, levelled };
}

/** Move one letter to `to` (or put it back with 0), leaving every other letter where it is. */
export function moveOne(glyphs: Record<string, Glyph>, levelled: Levelled, id: string, to: number): { glyphs: Record<string, Glyph>; levelled: Levelled } {
  const g = glyphs[id];
  const d = to - (levelled[id] ?? 0);
  const next: Levelled = { ...levelled };
  if (to !== 0) next[id] = to; else delete next[id];
  if (!g || d === 0) return { glyphs, levelled: next };
  return { glyphs: { ...glyphs, [id]: { ...g, contours: shiftContours(g.contours, { x: 0, y: d }) } }, levelled: next };
}
