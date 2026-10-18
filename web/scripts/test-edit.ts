// Run: npx tsx scripts/test-edit.ts
import assert from "node:assert/strict";
import {
  addContour, area, bezier, curve, deleteContour, deletePoint, emptyGlyph, fitAdvance, insertPoint, isSmooth,
  makeCorner, makeSmooth, moveHandle, movePoint, nearestOnOutline, outlineBounds, reverseContour,
} from "../lib/handwriting/edit";
import type { Contour, Glyph } from "../lib/handwriting/types";

const z = { x: 0, y: 0 };
const sq = (x0: number, y0: number, x1: number, y1: number): Contour => [
  { p: { x: x0, y: y0 }, hi: z, ho: z }, { p: { x: x1, y: y0 }, hi: z, ho: z },
  { p: { x: x1, y: y1 }, hi: z, ho: z }, { p: { x: x0, y: y1 }, hi: z, ho: z },
];
const G = (...cts: Contour[]): Glyph => ({ id: "0784", cp: [0x784], kind: "letter", contours: cts, adv: 400 });
const near = (a: number, b: number, tol = 0.2, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);

// insertPoint keeps the curve exactly where it was, on a curved segment too
{
  const g = G([
    { p: { x: 0, y: 0 }, hi: { x: -40, y: -40 }, ho: { x: 80, y: 200 } },
    { p: { x: 300, y: 0 }, hi: { x: -90, y: 160 }, ho: { x: 60, y: -50 } },
    { p: { x: 150, y: -200 }, hi: { x: 80, y: 0 }, ho: { x: -80, y: 0 } },
  ]);
  const before = (t: number) => bezier(curve(g.contours[0][0], g.contours[0][1]), t);
  const h = insertPoint(g, 0, 0, 0.37);
  assert.equal(h.contours[0].length, 4);
  const a = curve(h.contours[0][0], h.contours[0][1]), b = curve(h.contours[0][1], h.contours[0][2]);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const want = before(t * 0.37), got = bezier(a, t);
    near(want.x, got.x, 0.6, "first half x"); near(want.y, got.y, 0.6, "first half y");
    const want2 = before(0.37 + t * 0.63), got2 = bezier(b, t);
    near(want2.x, got2.x, 0.6, "second half x"); near(want2.y, got2.y, 0.6, "second half y");
  }
  assert.equal(g.contours[0].length, 3, "original untouched");
}

// insert on the closing segment goes to the end
{
  const h = insertPoint(G(sq(0, 0, 100, 100)), 0, 3, 0.5);
  assert.equal(h.contours[0].length, 5);
  assert.deepEqual(h.contours[0][4].p, { x: 0, y: 50 });
}

// moving a point carries its handles
{
  const g = G([{ p: { x: 10, y: 10 }, hi: { x: -5, y: 0 }, ho: { x: 5, y: 0 } }, ...sq(0, 0, 9, 9).slice(0, 2)]);
  const h = movePoint(g, 0, 0, { x: 50, y: 60 });
  assert.deepEqual(h.contours[0][0].p, { x: 50, y: 60 });
  assert.deepEqual(h.contours[0][0].ho, { x: 5, y: 0 });
}

// smooth handles stay in line when one is dragged; corners move alone
{
  const g = G([
    { p: { x: 100, y: 100 }, hi: { x: -50, y: 0 }, ho: { x: 50, y: 0 } },
    { p: { x: 200, y: 0 }, hi: z, ho: z }, { p: { x: 0, y: 0 }, hi: z, ho: z },
  ]);
  assert.ok(isSmooth(g.contours[0][0]));
  const h = moveHandle(g, 0, 0, "ho", { x: 100 + 30, y: 100 + 40 }, true);
  assert.ok(isSmooth(h.contours[0][0]));
  near(Math.hypot(h.contours[0][0].hi.x, h.contours[0][0].hi.y), 50, 0.3, "other handle keeps its length");
  const c = makeCorner(h, 0, 0);
  assert.equal(isSmooth(c.contours[0][0]), false);
  const moved = moveHandle(c, 0, 0, "ho", { x: 140, y: 100 }, true);
  assert.deepEqual(moved.contours[0][0].hi, z, "a corner's other handle does not follow");
  const s = makeSmooth(c, 0, 0);
  assert.ok(isSmooth(s.contours[0][0]));
}

// deleting
{
  const g = G(sq(0, 0, 100, 100), sq(200, 0, 300, 100));
  assert.equal(deletePoint(g, 0, 1).contours[0].length, 3);
  assert.equal(deletePoint(deletePoint(g, 0, 1), 0, 0).contours.length, 1, "a shape left with two points disappears");
  assert.equal(deleteContour(g, 1).contours.length, 1);
}

// reversing flips direction and not geometry
{
  const g = G(sq(0, 0, 100, 100));
  const h = reverseContour(g, 0);
  assert.ok(area(g.contours[0]) * area(h.contours[0]) < 0);
  near(Math.abs(area(h.contours[0])), 10000, 0.01);
  const b0 = outlineBounds(g.contours), b1 = outlineBounds(h.contours);
  assert.deepEqual(b0, b1);
  assert.deepEqual(reverseContour(h, 0).contours[0].map((s) => s.p), g.contours[0].map((s) => s.p));
}

// nearest point on the outline
{
  const n = nearestOnOutline(G(sq(0, 0, 100, 100)).contours, { x: 50, y: -8 })!;
  assert.equal(n.c, 0); assert.equal(n.s, 0); near(n.d, 8, 0.01); near(n.at.x, 50, 3);
}

// advance follows the drawing; marks stay zero width; empty glyphs stay empty
{
  assert.equal(fitAdvance(G(sq(40, 0, 340, 300))).adv, 380);
  const mark = { ...G(sq(-20, 0, 20, 60)), kind: "fili" as const, adv: 0 };
  assert.equal(fitAdvance(mark).adv, 0);
  const e = emptyGlyph("0786", [0x786], "letter");
  assert.equal(fitAdvance(e).adv, 600);
  assert.equal(addContour(e, sq(40, 0, 300, 100)).contours.length, 1);
}
console.log("edit ops OK");
