import ClipperLib from "clipper-lib";
import { area } from "./edit";
import { fitContour, flattenContour, simplify } from "./shape";
import { UNITS_PER_MM, type Contour, type Glyph, type Pt } from "./types";

/**
 * The marker: freehand drawing with a nib you choose. The nib is swept along your hand's path, and the ink it leaves becomes
 * a filled outline that merges with the letter, like a shape drawn with the pen.
 */

export type NibShape = "round" | "oval" | "chisel" | "square";

export type Nib = {
  shape: NibShape;
  size: number;      // the nib's long side, in font units
  angle: number;     // degrees, how far the nib is turned (round ignores it)
  flat: number;      // 10..100, how flat the nib is: its short side as a share of its long side
  smooth: number;    // 0..90, how much the line is steadied while drawing
  taper: number;     // 0..100, how much the ends narrow
};

export const SIZE_MIN = Math.round(0.4 * UNITS_PER_MM);
export const SIZE_MAX = Math.round(5 * UNITS_PER_MM);
export const DEFAULT_NIB: Nib = { shape: "chisel", size: Math.round(1.8 * UNITS_PER_MM), angle: -40, flat: 22, smooth: 55, taper: 0 };

export const NIB_LABEL: Record<NibShape, string> = { round: "Round", oval: "Oval", chisel: "Chisel", square: "Square" };
/** What flatness a shape starts with, and whether its angle matters. */
export const NIB_START: Record<NibShape, { flat: number; angled: boolean }> = {
  round: { flat: 100, angled: false },
  oval: { flat: 45, angled: true },
  chisel: { flat: 22, angled: true },
  square: { flat: 100, angled: true },
};

/** Switching shape also resets the flatness to what that shape normally has. */
export const withShape = (n: Nib, shape: NibShape): Nib => ({ ...n, shape, flat: NIB_START[shape].flat });

export const cleanNib = (x: unknown): Nib => {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const shape = (["round", "oval", "chisel", "square"] as const).find((s) => s === o.shape) ?? DEFAULT_NIB.shape;
  return {
    shape, size: num(o.size, SIZE_MIN, SIZE_MAX, DEFAULT_NIB.size), angle: num(o.angle, -90, 90, DEFAULT_NIB.angle),
    flat: num(o.flat, 10, 100, NIB_START[shape].flat), smooth: num(o.smooth, 0, 90, DEFAULT_NIB.smooth), taper: num(o.taper, 0, 100, DEFAULT_NIB.taper),
  };
};

type P = [number, number];
const SC = 100;

/** The nib's outline around its middle, counter-clockwise, `f` times its size. */
export function nibPoly(n: Nib, f = 1): P[] {
  const long = Math.max(0.5, (n.size / 2) * f);
  const short = Math.max(0.5, long * (n.flat / 100));
  let pts: P[];
  if (n.shape === "chisel") pts = [[-long, -short / 2], [long, -short / 2], [long, short / 2], [-long, short / 2]];
  else if (n.shape === "square") { const hw = long * 0.8, hh = hw * (n.flat / 100); pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]; }
  else {
    const ry = n.shape === "round" ? long : short;
    pts = Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2; return [Math.cos(a) * long, Math.sin(a) * ry] as P; });
  }
  if (n.shape === "round") return pts;
  const a = (-n.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);      // a positive angle leans the nib to the right, as the sliders show it
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c] as P);
}

const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Smallest convex shape around the points, counter-clockwise (Andrew's monotone chain). */
function hull(points: P[]): P[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lo: P[] = [], up: P[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

/** One step of drawing: the line follows the hand, held back by the smoothing. Null when the hand has not moved far enough to matter. */
export function follow(last: Pt, to: Pt, smooth: number, minDist: number): Pt | null {
  const k = (smooth / 100) * 0.85;
  const q = { x: last.x + (to.x - last.x) * (1 - k), y: last.y + (to.y - last.y) * (1 - k) };
  return Math.hypot(q.x - last.x, q.y - last.y) < minDist ? null : q;
}

/** The ink of one stroke as a set of convex pieces: the nib at each point, joined to the nib at the next. */
export function strokeHulls(pts: Pt[], nib: Nib, press?: number[]): P[][] {
  if (!pts.length) return [];
  const MAXP = 360;
  // even out the spacing so a fast flick and a slow crawl cost the same
  const gap = Math.max(2.5, nib.size * 0.1);
  const path: { x: number; y: number; w: number }[] = [{ x: pts[0].x, y: pts[0].y, w: press?.[0] ?? 1 }];
  for (let i = 1; i < pts.length; i++) {
    const a = path[path.length - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d >= gap || i === pts.length - 1) path.push({ x: b.x, y: b.y, w: press?.[i] ?? 1 });
  }
  while (path.length > MAXP) for (let i = path.length - 2; i > 0; i -= 2) path.splice(i, 1);
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  const total = cum[cum.length - 1];
  const tapD = Math.max(1, Math.min(total / 2, (nib.taper / 100) * total * 0.5));
  const polys = path.map((q, i) => {
    let f = q.w;
    if (nib.taper > 0 && total > 0) f *= Math.max(0.12, Math.min(1, Math.min(cum[i], total - cum[i]) / tapD));
    return nibPoly(nib, Math.max(0.12, f)).map(([x, y]) => [x + q.x, y + q.y] as P);
  });
  if (polys.length === 1) return [polys[0]];
  const out: P[][] = [];
  for (let i = 0; i + 1 < polys.length; i++) out.push(hull([...polys[i], ...polys[i + 1]]));
  return out;
}

export const hullsToD = (hs: P[][]) => hs.map((h) => `M${h.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`).join("");

type CP = { X: number; Y: number }[];
const toPath = (poly: P[]): CP => poly.map(([x, y]) => ({ X: Math.round(x * SC), Y: Math.round(y * SC) }));
const shoelace = (poly: P[]) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

/** The letter with the stroke's ink merged in. Shapes the stroke touches become one clean outline; every other shape is left exactly as it was. */
export function addStroke(g: Glyph, hulls: P[][], nib: Nib): Glyph {
  if (!hulls.length) return g;
  const sign = (() => {
    let best = 0, s = 1;
    for (const ct of g.contours) { const a = area(ct); if (Math.abs(a) > Math.abs(best)) { best = a; s = Math.sign(a) || 1; } }
    return s;
  })();
  const ink = new ClipperLib.Paths();
  {
    const c = new ClipperLib.Clipper();
    // the pieces run the same way round as the letter's own filled shapes, so they add to them instead of cancelling
    c.AddPaths(hulls.map((h) => toPath(sign > 0 ? h : [...h].reverse())), ClipperLib.PolyType.ptSubject, true);
    c.Execute(ClipperLib.ClipType.ctUnion, ink, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  }
  if (!ink.length) return g;

  // group each filled shape with the holes inside it, so a stroke that crosses a hole takes the whole shape with it
  const paths = g.contours.map((ct) => toPath(flattenContour(ct, 4)));
  const areas = g.contours.map((ct) => area(ct));
  const isOuter = areas.map((a) => Math.sign(a) === sign || a === 0);
  const family: number[] = g.contours.map((_, i) => i);
  g.contours.forEach((_, i) => {
    if (isOuter[i] || !paths[i].length) return;
    let best = -1, bestArea = Infinity;
    g.contours.forEach((__, j) => {
      if (!isOuter[j] || j === i || !paths[j].length) return;
      if (ClipperLib.Clipper.PointInPolygon(paths[i][0], paths[j]) !== 0 && Math.abs(areas[j]) < bestArea) { best = j; bestArea = Math.abs(areas[j]); }
    });
    if (best >= 0) family[i] = best;
  });
  const touchedFamily = new Set<number>();
  for (let j = 0; j < paths.length; j++) {
    if (!isOuter[j] || !paths[j].length) continue;
    const members = paths.filter((_, i) => family[i] === j);
    const solid = new ClipperLib.Paths();
    const c1 = new ClipperLib.Clipper();
    c1.AddPaths(members, ClipperLib.PolyType.ptSubject, true);
    c1.Execute(ClipperLib.ClipType.ctUnion, solid, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    const hit = new ClipperLib.Paths();
    const c2 = new ClipperLib.Clipper();
    c2.AddPaths(solid, ClipperLib.PolyType.ptSubject, true);
    c2.AddPaths(ink, ClipperLib.PolyType.ptClip, true);
    c2.Execute(ClipperLib.ClipType.ctIntersection, hit, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
    if (hit.length) touchedFamily.add(j);
  }

  const keep: Contour[] = [];
  const merge: CP[] = [];
  g.contours.forEach((ct, i) => {
    if (touchedFamily.has(family[i])) merge.push(paths[i]); else keep.push(ct);
  });
  const all = new ClipperLib.Paths();
  const c = new ClipperLib.Clipper();
  c.AddPaths(merge, ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(ink, ClipperLib.PolyType.ptClip, true);
  c.Execute(ClipperLib.ClipType.ctUnion, all, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);

  const tol = 0.5 + nib.size * 0.012;
  const made: Contour[] = [];
  for (const path of all as CP[]) {
    const hole = !ClipperLib.Clipper.Orientation(path);
    let poly = path.map(({ X, Y }) => [X / SC, Y / SC] as P);
    poly = simplify(poly, tol);
    if (poly.length < 3) continue;
    if (Math.sign(shoelace(poly)) !== (hole ? -sign : sign)) poly = [...poly].reverse();     // filled shapes keep the letter's direction, holes the opposite
    made.push(fitContour(poly, 50));
  }
  return { ...g, contours: [...keep, ...made] };
}
