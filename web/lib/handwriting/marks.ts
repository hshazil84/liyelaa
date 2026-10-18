import type { Contour, Glyph, Pt } from "./types";

/** Where vowel marks attach, in font units. This mirrors the builder, so the preview matches the exported font. */
export const REF_TOP = 342;        // top of the dotted box on the template (9 mm)
export const REF_BOTTOM = 0;
export const MARKS_BELOW = new Set([0x07aa, 0x07ab]);   // ubufili and ooboofili sit under the letter
export const GAP_TOO_FAR = 150;
export const MARK_GAP_MIN = 24;   // a freshly drawn mark is kept at least this far clear of its letter
export const MARK_GAP_MAX = 160;
export const CLEAR = 45;          // a mark keeps at least this much clear air from its letter, wherever the two overlap sideways (about 1 mm)    // a mark floating further than this from its letter is flagged

export type Offset = { dx: number; dy: number };
export type Offsets = Record<string, Offset>;

export const offsetKey = (letterId: string, markId: string) => `${letterId}|${markId}`;
export const isBelow = (mark: Glyph) => MARKS_BELOW.has(mark.cp[0]);
export const markAnchor = (mark: Glyph): Pt => ({ x: 0, y: isBelow(mark) ? REF_BOTTOM : REF_TOP });

// ---- geometry on flattened outlines
type Poly = Pt[];

function flatten(contours: Contour[], steps = 10): Poly[] {
  const out: Poly[] = [];
  for (const c of contours) {
    if (!c.length) continue;
    const poly: Poly = [];
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      const p0 = a.p, p1 = { x: a.p.x + a.ho.x, y: a.p.y + a.ho.y }, p2 = { x: b.p.x + b.hi.x, y: b.p.y + b.hi.y }, p3 = b.p;
      for (let k = 0; k < steps; k++) {
        const t = k / steps, u = 1 - t;
        poly.push({
          x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
          y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
        });
      }
    }
    out.push(poly);
  }
  return out;
}

export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Parameter values where a cubic's coordinate is at its highest or lowest (the roots of the derivative). */
function extremaT(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0;
  const ts: number[] = [];
  if (Math.abs(a) < 1e-9) { if (Math.abs(b) > 1e-9) ts.push(-c / b); }
  else {
    const d = b * b - 4 * a * c;
    if (d >= 0) { const r = Math.sqrt(d); ts.push((-b + r) / (2 * a), (-b - r) / (2 * a)); }
  }
  return ts.filter((t) => t > 0 && t < 1);
}

/** The true ink box: the curves' own highest and lowest points, which is what the font builder anchors to. */
export function inkBox(g: Glyph): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  const at = (t: number, a: number, b: number, c: number, d: number) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
  for (const c of g.contours) for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    const px = [a.p.x, a.p.x + a.ho.x, b.p.x + b.hi.x, b.p.x], py = [a.p.y, a.p.y + a.ho.y, b.p.y + b.hi.y, b.p.y];
    add(a.p.x, a.p.y);
    for (const t of [...extremaT(px[0], px[1], px[2], px[3]), ...extremaT(py[0], py[1], py[2], py[3])]) {
      add(at(t, px[0], px[1], px[2], px[3]), at(t, py[0], py[1], py[2], py[3]));
    }
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

/** Is the point inside the outline? Same rule as the font: any winding counts as filled. */
function inside(polys: Poly[], pt: Pt): boolean {
  let wn = 0;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (a.y <= pt.y) {
        if (b.y > pt.y && (b.x - a.x) * (pt.y - a.y) - (pt.x - a.x) * (b.y - a.y) > 0) wn++;
      } else if (b.y <= pt.y && (b.x - a.x) * (pt.y - a.y) - (pt.x - a.x) * (b.y - a.y) < 0) wn--;
    }
  }
  return wn !== 0;
}

// ---- placement
const liftCache = new WeakMap<Glyph, WeakMap<Glyph, number>>();

/**
 * How far a mark must move away from its letter so the two outlines are at least CLEAR apart.
 * The box of the letter is not enough: a slanted letter's highest point can be off to one side, right under the mark's end.
 * Marks above only ever move up (positive), marks below only down (negative).
 */
function clearanceLift(letter: Glyph, mark: Glyph, base: Pt): number {
  let byMark = liftCache.get(letter);
  const hit = byMark?.get(mark);
  if (hit !== undefined) return hit;
  const m = markAnchor(mark), below = isBelow(mark);
  const mp = flatten(shiftContours(mark.contours, { x: base.x - m.x, y: base.y - m.y }), 8).flat();
  const lp = flatten(letter.contours, 10).flat();
  let lift = 0;
  for (const p of mp) for (const q of lp) {
    const dx = Math.abs(p.x - q.x);
    if (dx >= CLEAR) continue;
    const s = Math.sqrt(CLEAR * CLEAR - dx * dx);
    lift = below ? Math.min(lift, q.y - s - p.y) : Math.max(lift, q.y + s - p.y);
  }
  lift = Math.round(lift);
  if (!byMark) { byMark = new WeakMap(); liftCache.set(letter, byMark); }
  byMark.set(mark, lift);
  return lift;
}

/** Where a letter's mark attaches before any hand adjustment. Marks above use the top, marks below the bottom, then clear of the outline. */
export function autoAnchor(letter: Glyph, mark: Glyph, clear = true): Pt | null {
  const b = inkBox(letter);
  if (!b) return null;
  const cx = Math.round((b.x0 + b.x1) / 2);
  const base = { x: cx, y: Math.round(isBelow(mark) ? b.y0 : b.y1) };
  return clear && mark.contours.length ? { x: base.x, y: base.y + clearanceLift(letter, mark, base) } : base;
}

/** Where the mark lands on the letter: the anchor, the hand adjustment, and the mark's own reference point. */
export function markShift(letter: Glyph, mark: Glyph, off?: Offset): Pt | null {
  const a = autoAnchor(letter, mark);
  if (!a) return null;
  const m = markAnchor(mark);
  return { x: a.x + (off?.dx ?? 0) - m.x, y: a.y + (off?.dy ?? 0) - m.y };
}

export function shiftContours(contours: Contour[], d: Pt): Contour[] {
  return contours.map((c) => c.map((s) => ({ ...s, p: { x: s.p.x + d.x, y: s.p.y + d.y } })));
}

export type Check = { ok: boolean; why?: "overlaps" | "far" | "missing" };

/** Does this letter and mark pair need a look? It does if the mark touches the letter or floats away from it. */
export function checkPair(letter: Glyph, mark: Glyph, off?: Offset): Check {
  const lb = inkBox(letter), shift = markShift(letter, mark, off);
  if (!lb || !shift || !mark.contours.length) return { ok: false, why: "missing" };
  const placed = shiftContours(mark.contours, shift);
  const mp = flatten(placed, 6), lp = flatten(letter.contours, 10);
  for (const poly of mp) for (const p of poly) if (inside(lp, p)) return { ok: false, why: "overlaps" };
  for (const poly of lp) for (let i = 0; i < poly.length; i += 3) if (inside(mp, poly[i])) return { ok: false, why: "overlaps" };
  let y0 = Infinity, y1 = -Infinity;
  for (const poly of mp) for (const p of poly) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const gap = isBelow(mark) ? lb.y0 - y1 : y0 - lb.y1;
  if (gap > GAP_TOO_FAR) return { ok: false, why: "far" };
  return { ok: true };
}

/**
 * People do not write a mark exactly where the template shows it: low in its box, on the wrong side of the baseline, or touching it.
 * Move the drawing up or down so it sits just clear of where the letter will be (above the top, or below the bottom),
 * keeping the gap the person drew when it is a sensible one. Sideways position is left as drawn.
 */
export function snapMark(mark: Glyph): Glyph {
  const b = inkBox(mark);
  if (!b) return mark;
  const below = isBelow(mark);
  const drawn = below ? REF_BOTTOM - b.y1 : b.y0 - REF_TOP;      // gap between the drawing and the reference line, if it is on the right side
  const gap = Math.min(MARK_GAP_MAX, Math.max(MARK_GAP_MIN, drawn));
  const dy = below ? REF_BOTTOM - gap - b.y1 : REF_TOP + gap - b.y0;
  return Math.abs(dy) < 0.5 ? mark : { ...mark, contours: shiftContours(mark.contours, { x: 0, y: Math.round(dy * 10) / 10 }) };
}
