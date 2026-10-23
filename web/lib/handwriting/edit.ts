import { LSB, type Contour, type Glyph, type Pt, type Seg } from "./types";

/** Pure editing operations on glyph outlines. Every function returns a new glyph; nothing is changed in place. */

export type Sel = { c: number; s: number } | null;

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const len = (a: Pt) => Math.hypot(a.x, a.y);
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const round1 = (n: number) => Math.round(n * 10) / 10;
const r1 = (p: Pt): Pt => ({ x: round1(p.x), y: round1(p.y) });
const zero = (): Pt => ({ x: 0, y: 0 });

/** The four control points of the curve that leaves segment `a` and arrives at `b`. */
export function curve(a: Seg, b: Seg): [Pt, Pt, Pt, Pt] {
  return [a.p, add(a.p, a.ho), add(b.p, b.hi), b.p];
}

export function bezier([p0, p1, p2, p3]: [Pt, Pt, Pt, Pt], t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Closest point on any outline to `pt`: which segment (c, s), where along it (t), and how far away. */
export function nearestOnOutline(contours: Contour[], pt: Pt, steps = 40): { c: number; s: number; t: number; d: number; at: Pt } | null {
  let best: { c: number; s: number; t: number; d: number; at: Pt } | null = null;
  contours.forEach((ct, c) => {
    for (let s = 0; s < ct.length; s++) {
      const cv = curve(ct[s], ct[(s + 1) % ct.length]);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, at = bezier(cv, t), d = dist(at, pt);
        if (!best || d < best.d) best = { c, s, t, d, at };
      }
    }
  });
  return best;
}

/** Split segment (c, s) at t without changing the shape (de Casteljau). The new point gets index s + 1. */
export function insertPoint(g: Glyph, c: number, s: number, t: number): Glyph {
  const out = clone(g);
  const ct = out.contours[c];
  const a = ct[s], b = ct[(s + 1) % ct.length];
  const [p0, p1, p2, p3] = curve(a, b);
  const q0 = lerp(p0, p1, t), q1 = lerp(p1, p2, t), q2 = lerp(p2, p3, t);
  const r0 = lerp(q0, q1, t), r1p = lerp(q1, q2, t);
  const m = lerp(r0, r1p, t);
  a.ho = r1(sub(q0, p0));
  b.hi = r1(sub(q2, p3));
  ct.splice(s + 1, 0, { p: r1(m), hi: r1(sub(r0, m)), ho: r1(sub(r1p, m)) });
  return out;
}

export function movePoint(g: Glyph, c: number, s: number, to: Pt): Glyph {
  const out = clone(g);
  out.contours[c][s].p = r1(to);        // handles are relative, so they travel with the point
  return out;
}

export function nudge(g: Glyph, c: number, s: number, dx: number, dy: number): Glyph {
  const p = g.contours[c][s].p;
  return movePoint(g, c, s, { x: p.x + dx, y: p.y + dy });
}

export function isSmooth(seg: Seg): boolean {
  const a = len(seg.hi), b = len(seg.ho);
  if (a < 1 || b < 1) return false;
  const cross = Math.abs(seg.hi.x * seg.ho.y - seg.hi.y * seg.ho.x) / (a * b);
  const dot = seg.hi.x * seg.ho.x + seg.hi.y * seg.ho.y;
  return cross < 0.05 && dot < 0;      // opposite directions, in line
}

/** Move one handle. For a smooth point the other handle stays in line and keeps its own length. */
export function moveHandle(g: Glyph, c: number, s: number, which: "hi" | "ho", to: Pt, keepSmooth: boolean): Glyph {
  const out = clone(g);
  const seg = out.contours[c][s];
  const other = which === "hi" ? "ho" : "hi";
  const h = r1(sub(to, seg.p));
  const wasSmooth = keepSmooth && isSmooth(g.contours[c][s]);
  seg[which] = h;
  if (wasSmooth && len(h) > 0.5) {
    const l = len(seg[other]) || len(h);
    seg[other] = r1(mul(h, -l / len(h)));
  }
  return out;
}

/** Make a point smooth: handles line up with the direction between its neighbours. */
export function makeSmooth(g: Glyph, c: number, s: number): Glyph {
  const out = clone(g);
  const ct = out.contours[c];
  const n = ct.length;
  const prev = ct[(s + n - 1) % n], seg = ct[s], next = ct[(s + 1) % n];
  const dir = sub(next.p, prev.p);
  const d = len(dir) || 1;
  const u = mul(dir, 1 / d);
  seg.ho = r1(mul(u, dist(seg.p, next.p) / 3));
  seg.hi = r1(mul(u, -dist(seg.p, prev.p) / 3));
  return out;
}

/** Make a point a sharp corner: no handles. */
export function makeCorner(g: Glyph, c: number, s: number): Glyph {
  const out = clone(g);
  out.contours[c][s].hi = zero();
  out.contours[c][s].ho = zero();
  return out;
}

/** Remove a point. A shape with fewer than three points is removed completely. */
export function deletePoint(g: Glyph, c: number, s: number): Glyph {
  const out = clone(g);
  out.contours[c].splice(s, 1);
  if (out.contours[c].length < 3) out.contours.splice(c, 1);
  return out;
}

export function deleteContour(g: Glyph, c: number): Glyph {
  const out = clone(g);
  out.contours.splice(c, 1);
  return out;
}

/** Turn a shape inside out: fill becomes hole and hole becomes fill. The outline itself does not move. */
export function reverseContour(g: Glyph, c: number): Glyph {
  const out = clone(g);
  const ct = out.contours[c];
  out.contours[c] = ct.map((s) => ({ p: s.p, hi: s.ho, ho: s.hi })).reverse();
  return out;
}

export function addContour(g: Glyph, contour: Contour): Glyph {
  const out = clone(g);
  out.contours.push(contour.map((s) => ({ p: r1(s.p), hi: r1(s.hi), ho: r1(s.ho) })));
  return out;
}

/** Signed area, y up: positive means counter-clockwise. */
export function area(ct: Contour): number {
  let a = 0;
  for (let i = 0; i < ct.length; i++) {
    const p = ct[i].p, q = ct[(i + 1) % ct.length].p;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function outlineBounds(contours: Contour[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ct of contours) for (let i = 0; i < ct.length; i++) {
    const cv = curve(ct[i], ct[(i + 1) % ct.length]);
    for (let k = 0; k <= 12; k++) {
      const p = bezier(cv, k / 12);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
  }
  return { x0, y0, x1, y1 };
}

/** Where a whole-letter drag starts from: scale about (ax, ay), then shift by (dx, dy). */
export type Xform = { ax: number; ay: number; sx: number; sy: number; dx: number; dy: number };

/** Move and resize a whole letter. Points and their handles scale together, so curves keep their shape. */
export function transformGlyph(g: Glyph, m: Xform): Glyph {
  const r = (n: number) => Math.round(n * 10) / 10;
  const contours = g.contours.map((ct) => ct.map((sg) => ({
    p: { x: r(m.ax + (sg.p.x - m.ax) * m.sx + m.dx), y: r(m.ay + (sg.p.y - m.ay) * m.sy + m.dy) },
    hi: { x: r(sg.hi.x * m.sx), y: r(sg.hi.y * m.sy) },
    ho: { x: r(sg.ho.x * m.sx), y: r(sg.ho.y * m.sy) },
  })));
  return { ...g, contours };
}

/** Turn a whole letter about (cx, cy), counter-clockwise by `rad` in font space. Handles turn with their points. */
export function rotateGlyph(g: Glyph, cx: number, cy: number, rad: number): Glyph {
  const r = (n: number) => Math.round(n * 10) / 10;
  const c = Math.cos(rad), s = Math.sin(rad);
  const turn = (x: number, y: number) => ({ x: r(x * c - y * s), y: r(x * s + y * c) });
  const contours = g.contours.map((ct) => ct.map((sg) => {
    const p = turn(sg.p.x - cx, sg.p.y - cy);
    return { p: { x: r(cx + p.x), y: r(cy + p.y) }, hi: turn(sg.hi.x, sg.hi.y), ho: turn(sg.ho.x, sg.ho.y) };
  }));
  return { ...g, contours };
}

/** Keep the advance wide enough for the drawing (letters only). Marks stay zero width. */
export function fitAdvance(g: Glyph): Glyph {
  if (g.kind === "fili" || !g.contours.length) return g;
  const { x1 } = outlineBounds(g.contours);
  const need = Math.max(Math.round(x1 + LSB), 2 * LSB);
  return need === g.adv ? g : { ...g, adv: need };
}

export function emptyGlyph(id: string, cp: number[], kind: Glyph["kind"]): Glyph {
  return { id, cp, kind, contours: [], adv: kind === "fili" ? 0 : 600, source: "drawn" };
}
