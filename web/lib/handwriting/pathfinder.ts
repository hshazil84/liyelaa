import ClipperLib from "clipper-lib";
import { flattenContour, fitContour, simplify } from "./shape";
import { glyphSign, orientInk, SC, type CP } from "./marker";
import { contourSet, type Obj } from "./objects";
import type { Contour, Glyph } from "./types";

/**
 * Combine the picked objects the way a vector editor's Pathfinder does. Objects run back to front in the order they were drawn.
 * The results are new objects at the front.
 */

export type Op = "unite" | "minusFront" | "minusBack" | "intersect" | "exclude" | "divide";
export const OPS: { op: Op; label: string; help: string }[] = [
  { op: "unite", label: "Unite", help: "Join them into one shape" },
  { op: "minusFront", label: "Minus front", help: "Cut the shapes in front out of the one at the back" },
  { op: "minusBack", label: "Minus back", help: "Cut the shapes behind out of the one at the front" },
  { op: "intersect", label: "Intersect", help: "Keep only where they all overlap" },
  { op: "exclude", label: "Exclude", help: "Keep everything except where they overlap" },
  { op: "divide", label: "Divide", help: "Split along every edge into separate pieces" },
];

const T = ClipperLib.ClipType;
const F = ClipperLib.PolyFillType.pftNonZero;

const run = (type: number, subject: CP[], clip: CP[]): CP[] => {
  const out = new ClipperLib.Paths();
  const c = new ClipperLib.Clipper();
  c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
  c.Execute(type, out, F, F);
  return out as CP[];
};
const union = (paths: CP[]): CP[] => run(T.ctUnion, paths, []);

/** What an object covers, holes cut out. */
function region(g: Glyph, o: Obj): CP[] {
  return union(o.c.map((c) => flattenContour(g.contours[c], 3).map(([x, y]) => ({ X: Math.round(x * SC), Y: Math.round(y * SC) }))));
}

const area2 = (p: CP) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.X * b.Y - b.X * a.Y; } return s; };
const empty = (r: CP[]) => !r.length || r.every((p) => Math.abs(area2(p)) < 2 * SC * SC * 0.05);

/** The pieces each operation leaves, as regions. */
function pieces(regions: CP[][], op: Op): CP[][] {
  const n = regions.length;
  if (op === "unite") return [union(regions.flat())];
  if (op === "minusFront") return [run(T.ctDifference, regions[0], union(regions.slice(1).flat()))];
  if (op === "minusBack") return [run(T.ctDifference, regions[n - 1], union(regions.slice(0, -1).flat()))];
  if (op === "intersect") return [regions.slice(1).reduce((acc, r) => run(T.ctIntersection, acc, r), regions[0])];
  if (op === "exclude") return [regions.slice(1).reduce((acc, r) => run(T.ctXor, acc, r), regions[0])];
  // divide: every part of the drawing that sits in exactly the same objects becomes its own piece
  let parts: CP[][] = [];
  for (const r of regions) {
    const next: CP[][] = [];
    let rest = r;
    for (const p of parts) {
      const both = run(T.ctIntersection, p, r), only = run(T.ctDifference, p, r);
      if (!empty(both)) next.push(both);
      if (!empty(only)) next.push(only);
      rest = run(T.ctDifference, rest, p);
    }
    if (!empty(rest)) next.push(rest);
    parts = next;
  }
  return parts;
}

/** A region as outlines running the letter's way round, holes the other way. */
function toContours(region: CP[], sign: number): Contour[] {
  const out: Contour[] = [];
  for (const path of orientInk(region, sign)) {
    const hole = !ClipperLib.Clipper.Orientation(path);
    let poly = path.map(({ X, Y }) => [X / SC, Y / SC] as [number, number]);
    poly = simplify(poly, 0.4);
    if (poly.length < 3) continue;
    let a = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
    if (Math.sign(a) !== (hole ? -sign : sign)) poly = [...poly].reverse();
    out.push(fitContour(poly, 50));
  }
  return out;
}

/** The letter after combining the picked objects, and how many contours came before the new ones. */
export function combine(g: Glyph, objs: Obj[], picked: number[], op: Op): { glyph: Glyph; keep: number } {
  const order = [...picked].sort((a, b) => a - b).filter((i) => objs[i]);
  if (order.length < 2) return { glyph: g, keep: g.contours.length };
  const sign = glyphSign(g);
  const made = pieces(order.map((i) => region(g, objs[i])), op).filter((r) => !empty(r)).flatMap((r) => toContours(r, sign));
  const gone = contourSet(objs, order);
  const rest = g.contours.filter((_, c) => !gone.has(c));
  return { glyph: { ...g, contours: [...rest, ...made] }, keep: rest.length };
}
