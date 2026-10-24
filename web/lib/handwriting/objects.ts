import { area } from "./edit";
import { flattenContour } from "./shape";
import { inkBox } from "./marks";
import { glyphSign } from "./marker";
import { liveStrokes } from "./penstroke";
import type { Contour, Glyph, Pt } from "./types";

/**
 * A letter is made of objects: each shape, hole-in-a-shape or pen line the person drew stays its own thing until they combine it.
 * An object is a filled outline with the holes inside it (or a pen line's outline). Later objects sit in front of earlier ones.
 */

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Obj = { c: number[]; stroke: number; box: Box };

type P = [number, number];

const polyBox = (ps: P[]): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ps) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};

const inside = (p: Pt, poly: P[]): boolean => {
  let on = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) on = !on;
  }
  return on;
};

const edgeDist = (p: Pt, poly: P[]): number => {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy)));
  }
  return best;
};

const flat = (ct: Contour): P[] => flattenContour(ct, 6);

/** The objects of a letter, back to front. */
export function objectsOf(g: Glyph): Obj[] {
  const { owner } = liveStrokes(g);
  const gs = glyphSign(g);
  const polys = g.contours.map(flat);
  const boxes = polys.map(polyBox);
  const isOuter = g.contours.map((ct, c) => owner[c] < 0 && (Math.sign(area(ct)) === gs || area(ct) === 0));
  const home = g.contours.map(() => -1);       // the outline a hole belongs to
  g.contours.forEach((ct, c) => {
    if (owner[c] >= 0 || isOuter[c] || !polys[c].length) return;
    let best = -1, bestA = Infinity;
    g.contours.forEach((o, j) => {
      if (!isOuter[j] || !polys[j].length) return;
      const a = Math.abs(area(o));
      if (a < bestA && inside({ x: polys[c][0][0], y: polys[c][0][1] }, polys[j])) { best = j; bestA = a; }
    });
    home[c] = best;
  });
  const out: Obj[] = [];
  const byStroke = new Map<number, Obj>();
  const byOuter = new Map<number, Obj>();
  g.contours.forEach((_, c) => {
    if (!polys[c].length) return;
    if (owner[c] >= 0) {
      let o = byStroke.get(owner[c]);
      if (!o) { o = { c: [], stroke: owner[c], box: boxes[c] }; byStroke.set(owner[c], o); out.push(o); }
      o.c.push(c);
    } else if (isOuter[c] || home[c] < 0) {
      const o: Obj = { c: [c], stroke: -1, box: boxes[c] };
      byOuter.set(c, o); out.push(o);
    }
  });
  g.contours.forEach((_, c) => {
    if (home[c] < 0) return;
    const o = byOuter.get(home[c]);
    if (o) o.c.push(c);
  });
  for (const o of out) {
    o.c.sort((a, b) => a - b);
    o.box = polyBox(o.c.flatMap((c) => polys[c]));
  }
  return out.sort((a, b) => a.c[0] - b.c[0]);
}

/** The front-most object under the point, or the nearest one within `tol` of its edge. -1 if none. */
export function hitObject(g: Glyph, objs: Obj[], p: Pt, tol: number): number {
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    if (p.x < o.box.x0 - tol || p.x > o.box.x1 + tol || p.y < o.box.y0 - tol || p.y > o.box.y1 + tol) continue;
    let n = 0;
    for (const c of o.c) if (inside(p, flat(g.contours[c]))) n++;
    if (n % 2 === 1) return i;
  }
  let best = -1, bestD = tol;
  objs.forEach((o, i) => {
    for (const c of o.c) { const d = edgeDist(p, flat(g.contours[c])); if (d <= bestD) { bestD = d; best = i; } }
  });
  return best;
}

export const contourSet = (objs: Obj[], picked: number[]): Set<number> => new Set(picked.flatMap((i) => objs[i]?.c ?? []));

/** Just the picked objects, as a letter, to measure or draw. */
export const subGlyph = (g: Glyph, objs: Obj[], picked: number[]): Glyph => {
  const set = contourSet(objs, picked);
  return { ...g, contours: g.contours.filter((_, c) => set.has(c)) };
};

export const pickedBox = (g: Glyph, objs: Obj[], picked: number[]): Box | null => (picked.length ? inkBox(subGlyph(g, objs, picked)) : null);

export function deleteObjects(g: Glyph, objs: Obj[], picked: number[]): Glyph {
  const set = contourSet(objs, picked);
  return { ...g, contours: g.contours.filter((_, c) => !set.has(c)) };
}

/** Move the picked objects in front of everything, or behind everything. */
export function arrange(g: Glyph, objs: Obj[], picked: number[], front: boolean): Glyph {
  const set = contourSet(objs, picked);
  const mine = g.contours.filter((_, c) => set.has(c)), rest = g.contours.filter((_, c) => !set.has(c));
  return { ...g, contours: front ? [...rest, ...mine] : [...mine, ...rest] };
}

/** A copy of the picked objects, a little way off, as plain shapes. */
export function duplicateObjects(g: Glyph, objs: Obj[], picked: number[], dx: number, dy: number): Glyph {
  const set = contourSet(objs, picked);
  const copy = g.contours.filter((_, c) => set.has(c)).map((ct) => ct.map((s) => ({ p: { x: s.p.x + dx, y: s.p.y + dy }, hi: { ...s.hi }, ho: { ...s.ho } })));
  return { ...g, contours: [...g.contours, ...copy] };
}

/** Which objects touch a rectangle. */
export const objectsInRect = (objs: Obj[], r: Box): number[] =>
  objs.flatMap((o, i) => (o.box.x1 >= r.x0 && o.box.x0 <= r.x1 && o.box.y1 >= r.y0 && o.box.y0 <= r.y1 ? [i] : []));
