import ClipperLib from "clipper-lib";
import { area, fitAdvance } from "./edit";
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
  chips: number;     // 0..100, nicks, bites and scratches cut into the ink
  bleed: number;     // 0..100, ink spreads and rounds the edges
  seed: number;      // which random damage the grunge uses; Shuffle changes it
};

export const IDENTITY: Shape = { smooth: 0, rough: 0, weight: 0, size: 100, width: 100, slant: 0, lift: 0, flip: false, chips: 0, bleed: 0, seed: 1 };
/** Nothing to apply. The seed alone is not a change, it only picks which damage a grunge setting gives. */
export const isIdentity = (s: Shape) => (Object.keys(IDENTITY) as (keyof Shape)[]).every((k) => k === "seed" || s[k] === IDENTITY[k]);

/** A small seeded random generator: the same seed always gives the same damage. */
export function rng(seed: number) {
  let a = Math.floor(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

/** Give the edge a hand-made wobble: a fine tremble plus a slower waver. The same amount and seed always give the same wobble. */
export function roughenGlyph(g: Glyph, amount: number, seed = 1): Glyph {
  if (amount <= 0) return g;
  const rnd = rng(11 * seed);
  return mapContours(g, (poly) => {
    const n = poly.length;
    const knots = Array.from({ length: Math.ceil(n / 5) + 2 }, () => rnd() * 2 - 1);
    return poly.map((q, i) => {
      const a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
      const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      const f = i / 5, k = Math.floor(f), lf = knots[k] * (1 - (f - k)) + knots[k + 1] * (f - k);
      const d = amount * 0.22 * (0.55 * (rnd() * 2 - 1) + 0.45 * lf);
      return [q[0] - (ty / tl) * d, q[1] + (tx / tl) * d] as P;
    });
  }, 10, 120);
}

// ---------------------------------------------------------------- grunge: ink that spreads, chips and scratches
type CP = { X: number; Y: number }[];
const SC = 100;
const toCP = (poly: P[]): CP => poly.map(([x, y]) => ({ X: Math.round(x * SC), Y: Math.round(y * SC) }));
const shoelace = (poly: P[]) => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

/** Which way round the letter's own filled shapes run (the largest one decides). */
export function outerSign(g: Glyph): number {
  let best = 0, sign = 1;
  for (const ct of g.contours) { const a = area(ct); if (Math.abs(a) > Math.abs(best)) { best = a; sign = Math.sign(a) || 1; } }
  return sign;
}

/** Clipper's result paths back into outlines: filled shapes run the way the letter's do, holes the opposite way. */
export function pathsToContours(paths: CP[], sign: number, tol: number, corner: number, minArea = 4): Contour[] {
  const out: Contour[] = [];
  for (const path of paths) {
    if (Math.abs(ClipperLib.Clipper.Area(path)) / (SC * SC) < minArea) continue;
    const hole = !ClipperLib.Clipper.Orientation(path);
    let poly = simplify(path.map(({ X, Y }) => [X / SC, Y / SC] as P), tol);
    if (poly.length < 3) continue;
    if (Math.sign(shoelace(poly)) !== (hole ? -sign : sign)) poly = [...poly].reverse();
    out.push(fitContour(poly, corner));
  }
  return out;
}

const solid = (g: Glyph): CP[] => {
  const paths = g.contours.map((ct) => toCP(flattenContour(ct, 4)));
  return ClipperLib.Clipper.SimplifyPolygons(paths, ClipperLib.PolyFillType.pftNonZero) as CP[];
};

/** Ink bleed: the ink spreads into the paper, which rounds the corners and closes tiny gaps. */
export function bleedGlyph(g: Glyph, amount: number): Glyph {
  if (amount <= 0 || !g.contours.length) return g;
  const out = solid(g);
  const grow = new ClipperLib.ClipperOffset(2, 0.2 * SC);
  grow.AddPaths(out, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const big = new ClipperLib.Paths();
  grow.Execute(big, amount * 0.2 * SC);
  const back = new ClipperLib.ClipperOffset(2, 0.2 * SC);
  back.AddPaths(big, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const res = new ClipperLib.Paths();
  back.Execute(res, -amount * 0.2 * 0.35 * SC);
  return { ...g, contours: pathsToContours(res, outerSign(g), 0.6, 60) };
}

/** A blob with a ragged edge, drawn counter-clockwise. */
const blob = (cx: number, cy: number, r: number, rnd: () => number): P[] => {
  const n = 9 + Math.floor(rnd() * 4);
  return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2, rr = r * (0.55 + 0.9 * rnd()); return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as P; });
};

/** Chips and scratches: small bites out of the edge, thin scratches across the ink and a few specks missing inside it. */
export function chipGlyph(g: Glyph, amount: number, seed = 1): Glyph {
  const box = inkBox(g);
  if (amount <= 0 || !box) return g;
  const rnd = rng(7919 * seed + 3), k = amount / 100;
  const polys = g.contours.map((ct) => flattenContour(ct, 6)).filter((p) => p.length > 2);
  const edge: P[] = polys.flat();
  const perimeter = edge.length * 6;
  const cuts: P[][] = [];
  const bites = Math.round((perimeter / 90) * k * 2.2);
  for (let i = 0; i < bites && edge.length > 2; i++) {
    const at = Math.floor(rnd() * edge.length), a = edge[at], b = edge[(at + 1) % edge.length];
    const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1, r = 2.5 + rnd() * 9 * (0.4 + k);
    const push = (rnd() - 0.45) * r;
    cuts.push(blob(a[0] - (ty / tl) * push, a[1] + (tx / tl) * push, r, rnd));
  }
  const w = box.x1 - box.x0, h = box.y1 - box.y0;
  const scratches = Math.round(k * 7 + (k > 0.3 ? 1 : 0));
  for (let i = 0; i < scratches; i++) {
    const x = box.x0 + rnd() * w, y = box.y0 + rnd() * h, ang = rnd() * Math.PI, len = 40 + rnd() * 150 * (0.4 + k), wd = 0.8 + rnd() * 2.2;
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy * wd, ny = dx * wd;
    cuts.push([[x - dx * len / 2 - nx, y - dy * len / 2 - ny], [x + dx * len / 2 - nx, y + dy * len / 2 - ny], [x + dx * len / 2 + nx, y + dy * len / 2 + ny], [x - dx * len / 2 + nx, y - dy * len / 2 + ny]]);
  }
  const specks = k > 0.4 ? Math.round(k * 9) : 0;
  for (let i = 0; i < specks; i++) cuts.push(blob(box.x0 + rnd() * w, box.y0 + rnd() * h, 1.5 + rnd() * 4.5, rnd));
  if (!cuts.length) return g;
  const clip = new ClipperLib.Paths();
  {
    const u = new ClipperLib.Clipper();
    u.AddPaths(cuts.map((c) => toCP(shoelace(c) < 0 ? [...c].reverse() : c)), ClipperLib.PolyType.ptSubject, true);
    u.Execute(ClipperLib.ClipType.ctUnion, clip, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  }
  const res = new ClipperLib.Paths();
  const c = new ClipperLib.Clipper();
  c.AddPaths(solid(g), ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
  c.Execute(ClipperLib.ClipType.ctDifference, res, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  const contours = pathsToContours(res, outerSign(g), 0.35, 45, 6);
  return contours.length ? { ...g, contours } : g;
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
  out = bleedGlyph(out, s.bleed);
  out = roughenGlyph(out, s.rough, s.seed);
  out = chipGlyph(out, s.chips, s.seed);
  out = placeGlyph(out, s);
  return out.contours.length ? fitAdvance(out) : g;
}
