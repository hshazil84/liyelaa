import ClipperLib from "clipper-lib";
import { area } from "./edit";
import { flattenContour } from "./shape";
import { addInk, glyphSign, orientInk, SC, type CP } from "./marker";
import { UNITS_PER_MM, type Contour, type Glyph, type Seg } from "./types";

/**
 * The pen: click dots, drag to curve. It draws either a filled shape (or a hole), or a stroke of a set weight along the dots,
 * like the Stroke panel in a vector editor. A stroke becomes a filled outline that merges with the letter.
 */

export type PenMode = "shape" | "stroke";
export type PenCap = "flat" | "round" | "square";
export type PenJoin = "sharp" | "round" | "bevel";
export type PenAlign = "centre" | "inside" | "outside";

export type PenOpts = {
  mode: PenMode;
  hole: boolean;      // shape mode: draw a hole instead of a filled shape
  snap: boolean;      // dots snap to the guide lines and the letter's edges
  weight: number;     // stroke width, font units
  cap: PenCap;        // the two ends of an open line
  join: PenJoin;      // the corners
  limit: number;      // how far a sharp corner may point before it is cut off
  align: PenAlign;    // where a closed line sits on its path
  fill: boolean;      // a closed line also fills its inside
};

export const WEIGHT_MIN = Math.round(0.3 * UNITS_PER_MM);
export const WEIGHT_MAX = Math.round(10 * UNITS_PER_MM);
export const LIMIT_MIN = 1, LIMIT_MAX = 10;

export const DEFAULT_PEN: PenOpts = {
  mode: "shape", hole: false, snap: true,
  weight: Math.round(1.8 * UNITS_PER_MM), cap: "round", join: "round", limit: 4, align: "centre", fill: false,
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const pick = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);

/** Whatever was stored, turned into settings that are safe to use. */
export const cleanPen = (x: unknown): PenOpts => {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    mode: pick(o.mode, ["shape", "stroke"] as const, DEFAULT_PEN.mode),
    hole: o.hole === true,
    snap: o.snap !== false,
    weight: clamp(num(o.weight, DEFAULT_PEN.weight), WEIGHT_MIN, WEIGHT_MAX),
    cap: pick(o.cap, ["flat", "round", "square"] as const, DEFAULT_PEN.cap),
    join: pick(o.join, ["sharp", "round", "bevel"] as const, DEFAULT_PEN.join),
    limit: clamp(num(o.limit, DEFAULT_PEN.limit), LIMIT_MIN, LIMIT_MAX),
    align: pick(o.align, ["centre", "inside", "outside"] as const, DEFAULT_PEN.align),
    fill: o.fill === true,
  };
};

type P = [number, number];
const STEP = 4;

/** The dots as an open line, with a point about every few font units along the curves. */
function flattenOpen(pen: Seg[]): P[] {
  const out: P[] = [];
  for (let i = 0; i < pen.length - 1; i++) {
    const a = pen[i], b = pen[i + 1];
    const p0: P = [a.p.x, a.p.y], p1: P = [a.p.x + a.ho.x, a.p.y + a.ho.y], p2: P = [b.p.x + b.hi.x, b.p.y + b.hi.y], p3: P = [b.p.x, b.p.y];
    const approx = (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) + Math.hypot(p3[0] - p0[0], p3[1] - p0[1])) / 2;
    const straight = !a.ho.x && !a.ho.y && !b.hi.x && !b.hi.y;
    const n = straight ? 1 : Math.max(2, Math.ceil(approx / STEP));
    for (let k = 0; k < n; k++) {
      const t = k / n, u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  }
  const last = pen[pen.length - 1];
  out.push([last.p.x, last.p.y]);
  return out;
}

const scaled = (poly: P[]): CP => poly.map(([x, y]) => ({ X: Math.round(x * SC), Y: Math.round(y * SC) }));

const JOIN = { sharp: ClipperLib.JoinType.jtMiter, round: ClipperLib.JoinType.jtRound, bevel: ClipperLib.JoinType.jtSquare };
const END = { flat: ClipperLib.EndType.etOpenButt, round: ClipperLib.EndType.etOpenRound, square: ClipperLib.EndType.etOpenSquare };

function offset(paths: CP[], d: number, join: number, end: number, limit: number): CP[] {
  const co = new ClipperLib.ClipperOffset(limit, 0.3 * SC);
  co.AddPaths(paths, join, end);
  const out = new ClipperLib.Paths();
  co.Execute(out, d * SC);
  return out as CP[];
}

function boolean(subject: CP[], clip: CP[], type: number): CP[] {
  const out = new ClipperLib.Paths();
  const c = new ClipperLib.Clipper();
  c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
  c.Execute(type, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return out as CP[];
}

/** A closed line cleaned of its own crossings, every piece running counter-clockwise, so an offset grows it outward. */
function cleanClosed(poly: P[]): CP[] {
  const simple = ClipperLib.Clipper.SimplifyPolygon(scaled(poly), ClipperLib.PolyFillType.pftNonZero) as CP[];
  return simple.map((p) => (ClipperLib.Clipper.Orientation(p) ? p : [...p].reverse()));
}

/**
 * The ink of the pen's line, as Clipper outlines (scaled by SC). Not yet turned to the letter's direction.
 * An open line has two ends; a closed one has none and can sit inside, on or outside its path.
 */
export function penStrokeInk(pen: Seg[], closed: boolean, o: PenOpts): CP[] {
  const need = closed ? 3 : 2;
  if (pen.length < need) return [];
  const half = o.weight / 2;
  const join = JOIN[o.join];
  if (!closed) {
    return offset([scaled(flattenOpen(pen))], half, join, END[o.cap], o.limit);
  }
  const ring = cleanClosed(flattenContour(pen, STEP));
  if (!ring.length) return [];
  const grow = (d: number) => offset(ring, d, join, ClipperLib.EndType.etClosedPolygon, o.limit);
  let ink: CP[];
  if (o.align === "inside") ink = boolean(ring, grow(-o.weight), ClipperLib.ClipType.ctDifference);
  else if (o.align === "outside") ink = boolean(grow(o.weight), ring, ClipperLib.ClipType.ctDifference);
  else ink = boolean(grow(half), grow(-half), ClipperLib.ClipType.ctDifference);
  if (o.fill) ink = boolean(ink, ring, ClipperLib.ClipType.ctUnion);
  return ink;
}

/** The same ink as one path for the screen, in font units. */
export function penStrokeD(pen: Seg[], closed: boolean, o: PenOpts): string {
  return penStrokeInk(pen, closed, o).map((p) => `M${p.map(({ X, Y }) => `${(X / SC).toFixed(1)} ${(Y / SC).toFixed(1)}`).join("L")}Z`).join("");
}

/** The letter with the pen's line merged in. */
export function addPenStroke(g: Glyph, pen: Seg[], closed: boolean, o: PenOpts): Glyph {
  const ink = penStrokeInk(pen, closed, o);
  if (!ink.length) return g;
  const sign = glyphSign(g);
  return addInk(g, orientInk(ink, sign), sign, 0.5 + o.weight * 0.012, false);
}

/** A new filled shape, or a hole, drawn the right way round for this letter. */
export function addPenShape(g: Glyph, pen: Seg[], hole: boolean): Glyph {
  if (pen.length < 3) return g;
  const sign = glyphSign(g);
  const want = hole ? -sign : sign;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  let ct: Contour = pen.map((s) => ({ p: { x: r1(s.p.x), y: r1(s.p.y) }, hi: { x: r1(s.hi.x), y: r1(s.hi.y) }, ho: { x: r1(s.ho.x), y: r1(s.ho.y) } }));
  if (Math.sign(area(ct)) !== want) ct = ct.map((s) => ({ p: s.p, hi: s.ho, ho: s.hi })).reverse();
  return { ...g, contours: [...g.contours, ct] };
}
