import ClipperLib from "clipper-lib";
import { fitAdvance } from "./edit";
import { inkBox } from "./marks";
import { LSB, type Contour, type Glyph, type Seg } from "./types";

/**
 * Whole-letter shape tools for the clean-up step: smooth, roughen, bolder or thinner, size, width, slant, position, flip.
 * Every function returns a new glyph. They work on the outline as a flat polygon and then fit curves back through it,
 * so a letter with dozens of traced points comes out with a few clean ones.
 */

export type Shape = {
  smooth: number;    // 0..100, evens out wobbles and drops extra points
  rough: number;     // 0..100, adds a hand-made wobble
  weight: number;    // -30..40, thinner to bolder
  size: number;      // percent, 50..150
  width: number;     // percent, 60..140
  slant: number;     // degrees, -25..25, positive leans right
  lift: number;      // font units up (+) or down (-)
  flip: boolean;     // mirror left to right
};

export const IDENTITY: Shape = { smooth: 0, rough: 0, weight: 0, size: 100, width: 100, slant: 0, lift: 0, flip: false };
export const isIdentity = (s: Shape) => (Object.keys(IDENTITY) as (keyof Shape)[]).every((k) => s[k] === IDENTITY[k]);

type P = [number, number];

// ---------------------------------------------------------------- outline <-> polygon
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The outline as a closed polygon with a point about every `step` font units. */
export function flattenContour(ct: Contour, step: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < ct.length; i++) {
    const a = ct[i], b = ct[(i + 1) % ct.length];
    const p0: P = [a.p.x, a.p.y], p1: P = [a.p.x + a.ho.x, a.p.y + a.ho.y], p2: P = [b.p.x + b.hi.x, b.p.y + b.hi.y], p3: P = [b.p.x, b.p.y];
    const approx = (dist(p0, p1) + dist(p1, p2) + dist(p2, p3) + dist(p0, p3)) / 2;
    const straight = !a.ho.x && !a.ho.y && !b.hi.x && !b.hi.y;
    const n = straight ? Math.max(1, Math.ceil(approx / step)) : Math.max(2, Math.ceil(approx / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  }
  return out;
}

function perpDist(p: P, a: P, b: P): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
  if (!l) return dist(p, a);
  return Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / l;
}

function dp(pts: P[], lo: number, hi: number, tol: number, keep: boolean[]) {
  let worst = -1, at = -1;
  for (let i = lo + 1; i < hi; i++) {
    const d = perpDist(pts[i], pts[lo], pts[hi]);
    if (d > worst) { worst = d; at = i; }
  }
  if (worst > tol) { keep[at] = true; dp(pts, lo, at, tol, keep); dp(pts, at, hi, tol, keep); }
}

/** Drop the points that a straighter run can do without (Douglas-Peucker on a closed polygon). */
export function simplify(pts: P[], tol: number): P[] {
  if (pts.length < 8 || tol <= 0) return pts;
  let far = 1, best = 0;
  for (let i = 1; i < pts.length; i++) { const d = dist(pts[0], pts[i]); if (d > best) { best = d; far = i; } }
  const keep = new Array(pts.length).fill(false);
  keep[0] = true; keep[far] = true;
  dp(pts, 0, far, tol, keep);
  const second = [...pts.slice(far), pts[0]];
  const k2 = new Array(second.length).fill(false);
  k2[0] = true; k2[second.length - 1] = true;
  dp(second, 0, second.length - 1, tol, k2);
  second.forEach((_, i) => { if (k2[i] && i > 0 && i < second.length - 1) keep[far + i] = true; });
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : pts;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Curves through the points. A point where the outline turns sharply stays a corner, the rest get smooth handles. */
export function fitContour(poly: P[], cornerDeg = 50): Contour {
  const n = poly.length;
  return poly.map((b, i) => {
    const a = poly[(i - 1 + n) % n], c = poly[(i + 1) % n];
    const v1: P = [b[0] - a[0], b[1] - a[1]], v2: P = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const turn = l1 && l2 ? (Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))) * 180) / Math.PI : 0;
    const seg: Seg = { p: { x: round1(b[0]), y: round1(b[1]) }, hi: { x: 0, y: 0 }, ho: { x: 0, y: 0 } };
    if (turn <= cornerDeg) {
      const tx = c[0] - a[0], ty = c[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      seg.ho = { x: round1((tx / tl) * (l2 / 3)), y: round1((ty / tl) * (l2 / 3)) };
      seg.hi = { x: round1(-(tx / tl) * (l1 / 3)), y: round1(-(ty / tl) * (l1 / 3)) };
    }
    return seg;
  });
}

function mapContours(g: Glyph, fn: (poly: P[], ct: Contour) => P[] | Contour | null, step: number, corner: number): Glyph {
  const contours: Contour[] = [];
  for (const ct of g.contours) {
    const r = fn(flattenContour(ct, step), ct);
    if (!r || r.length < 3) continue;
    contours.push(typeof (r[0] as Seg).p === "object" && !Array.isArray(r[0]) ? (r as Contour) : fitContour(r as P[], corner));
  }
  return { ...g, contours };
}

// ---------------------------------------------------------------- the tools
/** Even out wobbles from tracing and remove points that are not needed. */
export function smoothGlyph(g: Glyph, amount: number): Glyph {
  if (amount <= 0) return g;
  const passes = Math.round(amount / 6), tol = 0.5 + amount * 0.22;
  return mapContours(g, (poly) => {
    let p = poly;
    for (let k = 0; k < passes; k++) {
      const n = p.length;
      p = p.map((q, i) => {
        const a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
        return [q[0] * 0.5 + (a[0] + b[0]) * 0.25, q[1] * 0.5 + (a[1] + b[1]) * 0.25] as P;
      });
    }
    return simplify(p, tol);
  }, 7, 55);
}

/** Give the edge a hand-made wobble. The same amount always gives the same wobble. */
export function roughenGlyph(g: Glyph, amount: number): Glyph {
  if (amount <= 0) return g;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  return mapContours(g, (poly) => {
    const n = poly.length;
    return poly.map((q, i) => {
      const a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
      const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      const d = rnd() * amount * 0.7;
      return [q[0] - (ty / tl) * d, q[1] + (tx / tl) * d] as P;
    });
  }, 26, 180);
}

/** Make every stroke thicker (positive) or thinner (negative) by the same amount on both sides. */
export function weightGlyph(g: Glyph, units: number): Glyph {
  if (!units || !g.contours.length) return g;
  const SC = 100;
  const paths = g.contours.map((ct) => flattenContour(ct, 5).map(([x, y]) => ({ X: Math.round(x * SC), Y: Math.round(y * SC) })));
  const clean = ClipperLib.Clipper.SimplifyPolygons(paths, ClipperLib.PolyFillType.pftNonZero);
  const co = new ClipperLib.ClipperOffset(2, 0.2 * SC);
  co.AddPaths(clean, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const out = new ClipperLib.Paths();
  co.Execute(out, units * SC);
  const contours: Contour[] = [];
  for (const path of out as { X: number; Y: number }[][]) {
    const poly = simplify(path.map(({ X, Y }) => [X / SC, Y / SC] as P), 1.2);
    if (poly.length >= 3) contours.push(fitContour(poly, 50));
  }
  return { ...g, contours };
}

/** Size, width, slant, position and flip. Size and width grow the letter from the middle of its ink, slant leans it from the baseline. */
export function placeGlyph(g: Glyph, s: Pick<Shape, "size" | "width" | "slant" | "lift" | "flip">): Glyph {
  const box = inkBox(g);
  if (!box || (s.size === 100 && s.width === 100 && !s.slant && !s.lift && !s.flip)) return g;
  const cx = (box.x0 + box.x1) / 2;
  const sy = s.size / 100, sx = (s.size / 100) * (s.width / 100) * (s.flip ? -1 : 1), k = Math.tan((s.slant * Math.PI) / 180);
  const pt = (x: number, y: number): P => { const Y = y * sy + s.lift; return [(x - cx) * sx + Y * k + cx, Y]; };
  const vec = (x: number, y: number): P => { const Y = y * sy; return [x * sx + Y * k, Y]; };
  const moved = g.contours.map((ct) => ct.map((sg) => {
    const [px, py] = pt(sg.p.x, sg.p.y), [hx, hy] = vec(sg.hi.x, sg.hi.y), [ox, oy] = vec(sg.ho.x, sg.ho.y);
    return { p: { x: round1(px), y: round1(py) }, hi: { x: round1(hx), y: round1(hy) }, ho: { x: round1(ox), y: round1(oy) } };
  }));
  let out: Glyph = { ...g, contours: moved };
  const nb = inkBox(out);
  if (nb && g.kind !== "fili" && nb.x0 < LSB) {
    const d = LSB - nb.x0;           // keep a little room on the left of a letter
    out = { ...out, contours: out.contours.map((ct) => ct.map((sg) => ({ ...sg, p: { x: round1(sg.p.x + d), y: sg.p.y } }))) };
  }
  return out;
}

/** All the tools in one go, in the order a person would expect: thickness, then edges, then size and position. */
export function applyShape(g: Glyph, s: Shape): Glyph {
  if (isIdentity(s) || !g.contours.length) return g;
  let out = weightGlyph(g, s.weight * 0.6);
  out = smoothGlyph(out, s.smooth);
  out = roughenGlyph(out, s.rough);
  out = placeGlyph(out, s);
  return out.contours.length ? fitAdvance(out) : g;
}
