import ClipperLib from "clipper-lib";
import { fitContour, simplify } from "./shape";
import type { Stroke } from "./svgimport";
import type { Contour, Seg } from "./types";

type P = [number, number];

/** Points along a line of segments. A closed line also runs from the last point back to the first. */
function flattenLine(segs: Seg[], closed: boolean, step: number): P[] {
  const out: P[] = [];
  const last = closed ? segs.length : segs.length - 1;
  for (let i = 0; i < last; i++) {
    const a = segs[i], b = segs[(i + 1) % segs.length];
    const p0: P = [a.p.x, a.p.y], p1: P = [a.p.x + a.ho.x, a.p.y + a.ho.y], p2: P = [b.p.x + b.hi.x, b.p.y + b.hi.y], p3: P = [b.p.x, b.p.y];
    const approx = (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) + Math.hypot(p3[0] - p0[0], p3[1] - p0[1])) / 2;
    const n = Math.max(2, Math.ceil(approx / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  }
  if (!closed) out.push([segs[segs.length - 1].p.x, segs[segs.length - 1].p.y]);
  return out;
}

/**
 * Turn lines with a width into filled outlines, with round ends and round corners, right here in the browser.
 * Strokes that cross themselves or each other become one clean shape.
 */
export function outlineStrokesLocal(strokes: Stroke[]): Contour[] {
  const SC = 100;
  const all: { X: number; Y: number }[][] = [];
  let width = 1;
  for (const s of strokes) {
    if (s.segs.length < 2 || !(s.width > 0)) continue;
    width = Math.max(width, s.width);
    const step = Math.max(s.width / 4, 0.5);
    const path = flattenLine(s.segs, s.closed, step).map(([x, y]) => ({ X: Math.round(x * SC), Y: Math.round(y * SC) }));
    const co = new ClipperLib.ClipperOffset(2, Math.max(0.05, s.width * 0.02) * SC);
    co.AddPath(path, ClipperLib.JoinType.jtRound, s.closed ? ClipperLib.EndType.etClosedLine : ClipperLib.EndType.etOpenRound);
    const out = new ClipperLib.Paths();
    co.Execute(out, (s.width / 2) * SC);
    all.push(...out);
  }
  if (!all.length) return [];
  const clean = ClipperLib.Clipper.SimplifyPolygons(all, ClipperLib.PolyFillType.pftNonZero);
  const contours: Contour[] = [];
  for (const path of clean as { X: number; Y: number }[][]) {
    const poly = simplify(path.map(({ X, Y }) => [X / SC, Y / SC] as P), 0.4 + width * 0.02);
    if (poly.length >= 3) contours.push(fitContour(poly, 50));
  }
  return contours;
}
