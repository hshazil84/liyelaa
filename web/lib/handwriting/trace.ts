import { contours as d3contours } from "d3-contour";

/** A closed outline in image pixels (y down). Handles are relative to their point. */
export type PxSeg = { x: number; y: number; hix: number; hiy: number; hox: number; hoy: number };

/** The small part of paper.js this file uses. */
type PaperSeg = { point: { x: number; y: number }; handleIn: { x: number; y: number }; handleOut: { x: number; y: number } };
type PaperPath = { simplify(tolerance: number): void; segments: PaperSeg[] };
type Paper = {
  setup(canvas: HTMLCanvasElement): void;
  Point: new (x: number, y: number) => unknown;
  Path: new (opts: { segments: unknown[]; closed: boolean; insert: boolean }) => PaperPath;
};

let paperPromise: Promise<Paper> | null = null;
async function getPaper(): Promise<Paper> {
  if (!paperPromise) {
    paperPromise = import("paper/dist/paper-core").then((m) => {
      const paper = ((m as unknown as { default?: Paper }).default ?? m) as unknown as Paper;
      paper.setup(document.createElement("canvas"));
      return paper;
    });
  }
  return paperPromise;
}

export function boxBlur3(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      s += src[yy * w + xx]; n++;
    }
    out[y * w + x] = s / n;
  }
  return out;
}

function ringArea(r: number[][]): number {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return Math.abs(a / 2);
}

/**
 * Turn a "how dark is each pixel" grid into smooth closed outlines.
 * d3-contour finds the edge at sub-pixel precision; paper.js fits Bezier curves through it with few points.
 * Both are permissively licensed (ISC and MIT), unlike potrace.
 */
export async function traceField(field: Float32Array, w: number, h: number, level: number, opts?: { tolerance?: number; minArea?: number }): Promise<PxSeg[][]> {
  const tol = opts?.tolerance ?? 0.9, minArea = opts?.minArea ?? 6;
  const paper = await getPaper();
  const polys = d3contours().size([w, h]).thresholds([level])(Array.from(field))[0]?.coordinates ?? [];
  const out: PxSeg[][] = [];
  for (const poly of polys) {
    if (!poly.length || ringArea(poly[0]) < minArea) continue;          // drop specks
    for (const ring of poly) {
      if (ringArea(ring) < minArea) continue;
      const path = new paper.Path({ segments: ring.slice(0, -1).map((q) => new paper.Point(q[0], q[1])), closed: true, insert: false });
      path.simplify(tol);
      out.push(path.segments.map((s) => ({
        x: s.point.x, y: s.point.y, hix: s.handleIn.x, hiy: s.handleIn.y, hox: s.handleOut.x, hoy: s.handleOut.y,
      })));
    }
  }
  return out;
}
