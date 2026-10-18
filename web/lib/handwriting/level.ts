import { inkBox, shiftContours } from "./marks";
import { REFERENCE } from "./reference";
import type { Glyph } from "./types";

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

export type LevelPlan = { scale: number; moves: Record<string, { from: number; to: number }>; moved: number; biggest: number };

/**
 * Where each letter should sit. The middle of the letter's ink is lined up with the middle of the reference letter's ink,
 * scaled to the person's own writing size, so a letter that was drawn too high or too low goes back to the line.
 * `from` is the move already applied, `to` is the move wanted at this strength. Nothing is resized.
 */
export function planLevel(glyphs: Record<string, Glyph>, levelled: Levelled, strength: number): LevelPlan {
  const scale = writingScale(glyphs);
  const moves: LevelPlan["moves"] = {};
  let moved = 0, biggest = 0;
  for (const [id, ref] of Object.entries(REFERENCE)) {
    const g = glyphs[id];
    const b = g && g.contours.length ? inkBox(g) : null;
    if (!b) continue;
    const from = levelled[id] ?? 0;
    const drawnMid = (b.y0 + b.y1) / 2 - from;                  // where the letter was drawn, before any snap
    const wantMid = (scale * (ref[0] + ref[1])) / 2;
    const full = wantMid - drawnMid;
    const to = Math.round(full * strength);
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
