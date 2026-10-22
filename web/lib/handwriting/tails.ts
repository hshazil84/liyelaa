import ClipperLib from "clipper-lib";
import { flattenContour, fitContour, simplify } from "./shape";
import { LSB, UNITS_PER_MM, type Contour, type Glyph, type Pt } from "./types";

/**
 * Cursive tails: the last stroke of a letter, the part that already trails off to the left, runs on in a flowing line.
 * The tail is found from the outline alone (the leftmost thin stroke), carried on along its own direction, and merged into the letter.
 * Nothing else about the letter changes.
 */

export type TailStyle = "off" | "long" | "flick" | "joined";

export type TailSettings = {
  style: TailStyle;
  len: number;                        // how far the tail runs on, in font units (ignored by "joined")
  cur: number;                        // -50..100, how much it bends away from straight (positive drops, negative rises)
  hook: number;                       // 0..100, how much the end lifts like a pen leaving the page
  tap: number;                        // 0..100, how much it narrows toward the end
  extra: Record<string, number>;      // per letter: font units added to (or taken from) the length by hand
  off?: Record<string, boolean>;      // letters the person wants left as traced
};

export const LEN_MAX = Math.round(6 * UNITS_PER_MM);
export const EXTRA_STEP = Math.round(UNITS_PER_MM / 4);
export const EXTRA_MAX = 2 * UNITS_PER_MM;

export const PRESETS: Record<TailStyle, Omit<TailSettings, "extra">> = {
  off: { style: "off", len: 0, cur: 0, hook: 0, tap: 0 },
  long: { style: "long", len: Math.round(3 * UNITS_PER_MM), cur: 35, hook: 0, tap: 80 },
  flick: { style: "flick", len: Math.round(2 * UNITS_PER_MM), cur: 20, hook: 70, tap: 65 },
  joined: { style: "joined", len: 0, cur: 25, hook: 0, tap: 20 },
};

export const NAMES: Record<TailStyle, string> = { off: "As traced", long: "Long sweep", flick: "Flick", joined: "Joined" };
export const emptyTails = (): TailSettings => ({ ...PRESETS.off, extra: {} });

/** A tail wider than this at its root means the leftmost edge is a rounded body, not a stroke, so the letter gets no tail. */
const MAX_ROOT = 55, MIN_END = 15;
/** The tail starts this far inside the letter so it grows out of the stroke instead of sitting against its end. */
const ROOT_DEPTH = 36;
/** Past the end of the stroke, the tail reaches its full width over this distance. */
const RAMP = 24;
/** Joined tails reach past the letter's own left edge by this much, into its neighbour's space. */
export const JOIN_REACH = -(LSB + 25);
const JOIN_RISE = 70;

type P = [number, number];
const SC = 100;

export type Tip = { tip: Pt; dir: Pt; width: number; across: (depth: number) => number };

const area = (poly: P[]) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

/** Where the letter's last stroke ends, which way it is heading, and how thick it is back along the stroke. Null when the letter has no thin stroke on its left. */
export function findTip(g: Glyph): Tip | null {
  if (!g.contours.length) return null;
  const polys = g.contours.map((c) => flattenContour(c, 4));
  const outer = polys.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a));
  const n = outer.length;
  let at = 0;
  for (let i = 1; i < n; i++) if (outer[i][0] < outer[at][0]) at = i;
  const tip = outer[at];
  const k = Math.min(Math.floor(n / 4), 12);                    // the two edges, about 48 units either side of the tip
  const a = outer[(at - k + n) % n], b = outer[(at + k) % n];
  let dx = tip[0] - (a[0] + b[0]) / 2, dy = tip[1] - (a[1] + b[1]) / 2;
  const l = Math.hypot(dx, dy);
  if (l < 1) return null;
  dx /= l; dy /= l;
  if (dx > -0.2) return null;                                  // a tail runs out to the left; anything else is not an end stroke
  const nx = -dy, ny = dx;
  const across = (depth: number): number => {
    const cx = tip[0] - dx * depth, cy = tip[1] - dy * depth;
    const v = outer.filter((p) => Math.hypot(p[0] - cx, p[1] - cy) <= 75 && Math.abs((p[0] - cx) * dx + (p[1] - cy) * dy) <= 5)
      .map((p) => (p[0] - cx) * nx + (p[1] - cy) * ny);
    return v.length >= 2 ? Math.max(...v) - Math.min(...v) : 0;
  };
  const width = Math.max(across(40), across(34), across(46));
  if (width > MAX_ROOT || width < 2) return null;
  return { tip: { x: tip[0], y: tip[1] }, dir: { x: dx, y: dy }, width, across };
}

/** The height every joined tail heads for, so letters in a row meet at the same level: the middle of where their tails end now. */
export function joinHeight(tips: Tip[]): number {
  const ys = tips.map((t) => t.tip.y).sort((a, b) => a - b);
  return ys.length ? ys[Math.floor(ys.length / 2)] : 0;
}

/** The outline of one tail as a polygon, from inside the stroke to the tail's end. Inside the stroke it is as thick as the stroke, so it grows out without a step. */
export function tailPolygon(tip: Tip, s: Omit<TailSettings, "extra">, extra: number, joinY: number): P[] | null {
  const { dir } = tip;
  const D = ROOT_DEPTH;
  const S: P = [tip.tip.x - dir.x * D, tip.tip.y - dir.y * D];
  const n: P = [-dir.y, dir.x];                                // turns toward "down" for a tail heading left
  const wLocal = Math.max(3, tip.across(8));                   // how thick the stroke is at its very end
  const wEnd = Math.max(MIN_END, wLocal);                      // a tail swells to a pen-width just past the end, then narrows
  const w1 = Math.max(3, wEnd * (1 - s.tap / 100));
  const N = 56, pts: [number, number, number][] = [];
  const width = (a: number, out: number): number => {
    if (a < D) return Math.max(2, tip.across(D - a) * 0.88);
    const d = a - D;
    return d < RAMP ? wLocal + (wEnd - wLocal) * (d / RAMP) : wEnd + (w1 - wEnd) * Math.min(1, (d - RAMP) / Math.max(1, out - RAMP));
  };
  if (s.style === "joined") {
    const E: P = [JOIN_REACH, Math.max(tip.tip.y - JOIN_RISE, Math.min(tip.tip.y + JOIN_RISE, joinY))];   // heads for the shared height, but never swoops far from where the stroke ends
    const total = Math.hypot(E[0] - S[0], E[1] - S[1]) + extra;
    if (E[0] >= tip.tip.x - 10 || total < D + 12) return null;
    const k = total * 0.5;
    const C: P = [S[0] + dir.x * k, S[1] + dir.y * k];
    const sag = (s.cur / 100) * total * 0.12;
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const x = u * u * S[0] + 2 * u * t * C[0] + t * t * E[0], y = u * u * S[1] + 2 * u * t * C[1] + t * t * E[1];
      const bend = Math.sin(Math.PI * t) * sag;
      pts.push([x + n[0] * bend, y + n[1] * bend, width(total * t, total - D)]);
    }
  } else {
    const len = s.len + extra;
    if (len < 12) return null;
    const total = D + len, curve = s.cur / 100, hook = s.hook / 100;
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = total * t;
      const out = Math.max(0, a - D) / len;                      // how far past the stroke's end, 0 to 1: the bend starts there
      const bend = curve * len * 0.35 * out * out - hook * len * 0.9 * Math.pow(Math.max(0, out - 0.7), 2) * 4.4;
      pts.push([S[0] + dir.x * a + n[0] * bend, S[1] + dir.y * a + n[1] * bend, width(a, len)]);
    }
  }
  const L: P[] = [], R: P[] = [];
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    const h = pts[k][2] / 2;
    L.push([pts[k][0] - ty * h, pts[k][1] + tx * h]);
    R.push([pts[k][0] + ty * h, pts[k][1] - tx * h]);
  }
  const e = pts[pts.length - 1], r = e[2] / 2, cap: P[] = [];
  const last = pts[pts.length - 2];
  const ang = Math.atan2(e[1] - last[1], e[0] - last[0]);
  for (let k = 1; k < 8; k++) { const a = ang + Math.PI / 2 - (Math.PI * k) / 8; cap.push([e[0] + Math.cos(a) * r, e[1] + Math.sin(a) * r]); }
  return [...L, ...cap, ...R.reverse()];
}

const toPath = (poly: P[]) => poly.map(([x, y]) => ({ X: Math.round(x * SC), Y: Math.round(y * SC) }));

/** The letter with its tail merged in. */
export function addTail(g: Glyph, s: TailSettings, joinY: number, tip?: Tip | null): Glyph {
  if (s.style === "off" || g.kind !== "letter" || s.off?.[g.id]) return g;
  const t = tip === undefined ? findTip(g) : tip;
  if (!t) return g;
  const poly = tailPolygon(t, s, s.extra[g.id] ?? 0, joinY);
  if (!poly) return g;
  const subject = g.contours.map((c) => toPath(flattenContour(c, 4)));
  const clean = ClipperLib.Clipper.SimplifyPolygons(subject, ClipperLib.PolyFillType.pftNonZero);
  let tailPath = toPath(poly);
  const biggest = clean.reduce((a: { X: number; Y: number }[], b: { X: number; Y: number }[]) => (Math.abs(ClipperLib.Clipper.Area(b)) > Math.abs(ClipperLib.Clipper.Area(a)) ? b : a), clean[0]);
  if (ClipperLib.Clipper.Orientation(tailPath) !== ClipperLib.Clipper.Orientation(biggest)) tailPath = [...tailPath].reverse();
  const c = new ClipperLib.Clipper();
  c.AddPaths(clean, ClipperLib.PolyType.ptSubject, true);
  c.AddPath(tailPath, ClipperLib.PolyType.ptClip, true);
  const out = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctUnion, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  const contours: Contour[] = [];
  for (const path of out as { X: number; Y: number }[][]) {
    const pl = simplify(path.map(({ X, Y }) => [X / SC, Y / SC] as P), 0.9);
    if (pl.length >= 3) contours.push(fitContour(pl, 50));
  }
  return contours.length ? { ...g, contours } : g;
}

/** Every letter with the tail settings applied to its untouched (traced) outline. Letters with no tail to carry on come back as they were. */
export function applyTails(base: Record<string, Glyph>, s: TailSettings): { glyphs: Record<string, Glyph>; tipped: string[]; skipped: string[] } {
  const out: Record<string, Glyph> = { ...base };
  const tipped: string[] = [], skipped: string[] = [];
  if (s.style === "off") return { glyphs: out, tipped, skipped };
  const tips: Record<string, Tip | null> = {};
  for (const g of Object.values(base)) if (g.kind === "letter" && g.contours.length) tips[g.id] = findTip(g);
  const jy = joinHeight(Object.values(tips).filter((t): t is Tip => !!t));
  for (const [id, tip] of Object.entries(tips)) {
    if (!tip) { skipped.push(id); continue; }
    const next = addTail(base[id], s, jy, tip);
    if (next !== base[id]) { out[id] = next; tipped.push(id); } else skipped.push(id);
  }
  return { glyphs: out, tipped, skipped };
}
