import type { Contour, Glyph } from "./types";

/** SVG path data for outlines in font units. Draw it inside a group with transform="scale(1,-1)" (font y is up). */
export function contoursToD(contours: Contour[]): string {
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = "";
  for (const c of contours) {
    if (!c.length) continue;
    d += `M${f(c[0].p.x)} ${f(c[0].p.y)}`;
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      d += `C${f(a.p.x + a.ho.x)} ${f(a.p.y + a.ho.y)} ${f(b.p.x + b.hi.x)} ${f(b.p.y + b.hi.y)} ${f(b.p.x)} ${f(b.p.y)}`;
    }
    d += "Z";
  }
  return d;
}

export function glyphBounds(g: Glyph): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of g.contours) for (const s of c) {
    x0 = Math.min(x0, s.p.x); x1 = Math.max(x1, s.p.x); y0 = Math.min(y0, s.p.y); y1 = Math.max(y1, s.p.y);
  }
  return { x0, y0, x1, y1 };
}
