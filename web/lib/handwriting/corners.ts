import { lum } from "./image";
import type { Pt } from "./types";

export type MarksResult = { ok: true; pts: [Pt, Pt, Pt, Pt] } | { ok: false; reason: string };

type Blob = { area: number; minx: number; maxx: number; miny: number; maxy: number; cx: number; cy: number };

const PAGE_RATIO = 274 / 187;    // distance between mark centres: height / width

/**
 * Find the four black squares printed in the page corners.
 * Returns their centres in image pixels, ordered top-left, top-right, bottom-right, bottom-left,
 * where "top-left" is the square with a white hole, so the sheet can be any way round.
 */
export function findMarks(img: ImageData): MarksResult {
  const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const gray = downscaleGray(img, w, h);
  const blobs = darkBlobs(gray, w, h);
  const side = (b: Blob) => (b.maxx - b.minx + 1 + b.maxy - b.miny + 1) / 2;
  const cands = blobs
    .filter((b) => {
      const bw = b.maxx - b.minx + 1, bh = b.maxy - b.miny + 1;
      const s = Math.max(bw, bh);
      return s >= 7 && s <= 0.07 * Math.max(w, h) && bw / bh > 0.5 && bw / bh < 2 && b.area / (bw * bh) > 0.7;
    })
    .sort((a, b) => b.area - a.area)
    .slice(0, 18);
  if (cands.length < 4) return { ok: false, reason: "I could not see the four black squares in the corners. Make sure they are all in the photo." };

  let best: { combo: Blob[]; area: number } | null = null;
  for (let a = 0; a < cands.length; a++) for (let b = a + 1; b < cands.length; b++)
    for (let c = b + 1; c < cands.length; c++) for (let d = c + 1; d < cands.length; d++) {
      const combo = orderClockwise([cands[a], cands[b], cands[c], cands[d]]);
      const area = quadScore(combo, side);
      if (area > 0 && (!best || area > best.area)) best = { combo, area };
    }
  if (!best) return { ok: false, reason: "The four corner squares did not line up like a sheet of paper. Try a straighter photo with the whole sheet in view." };

  // The top-left square has a white hole. Look for it in the full-size photo.
  const holes = best.combo.map((b) => holeScore(img, b.cx / scale, b.cy / scale, side(b) / scale));
  const order = holes.map((s, i) => [s, i] as const).sort((p, q) => q[0] - p[0]);
  if (order[0][0] < 0.35 || order[1][0] > 0.3) {
    return { ok: false, reason: "I could not tell which way up the sheet is. The top-left square should have a white dot in it." };
  }
  const start = order[0][1];
  const pts = [0, 1, 2, 3].map((k) => {
    const b = best!.combo[(start + k) % 4];
    return { x: b.cx / scale, y: b.cy / scale };
  }) as [Pt, Pt, Pt, Pt];
  return { ok: true, pts };
}

function downscaleGray(img: ImageData, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const sx = img.width / w, sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let s = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < img.height; yy++) for (let xx = x0; xx < x1 && xx < img.width; xx++) {
        s += lum(img.data, (yy * img.width + xx) * 4); n++;
      }
      out[y * w + x] = s / Math.max(n, 1);
    }
  }
  return out;
}

function darkBlobs(g: Float32Array, w: number, h: number): Blob[] {
  // adaptive threshold: a pixel is dark if it is much darker than its neighbourhood
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; }
  }
  const r = Math.max(14, Math.round(0.03 * Math.max(w, h)));
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      if (g[y * w + x] < 0.62 * mean) dark[y * w + x] = 1;
    }
  }
  const seen = new Uint8Array(w * h);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!dark[i] || seen[i]) continue;
    const b: Blob = { area: 0, minx: w, maxx: 0, miny: h, maxy: 0, cx: 0, cy: 0 };
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = (p - x) / w;
      b.area++; b.cx += x; b.cy += y;
      if (x < b.minx) b.minx = x; if (x > b.maxx) b.maxx = x;
      if (y < b.miny) b.miny = y; if (y > b.maxy) b.maxy = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (dark[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    b.cx /= b.area; b.cy /= b.area;
    blobs.push(b);
  }
  return blobs;
}

function orderClockwise(bs: Blob[]): Blob[] {
  const cx = bs.reduce((s, b) => s + b.cx, 0) / 4, cy = bs.reduce((s, b) => s + b.cy, 0) / 4;
  return [...bs].sort((a, b) => Math.atan2(a.cy - cy, a.cx - cx) - Math.atan2(b.cy - cy, b.cx - cx));
}

/** Higher is better; 0 means "not a sheet of paper". Uses area so the corners that are furthest apart win. */
function quadScore(q: Blob[], side: (b: Blob) => number): number {
  const sizes = q.map(side);
  const mean = sizes.reduce((a, b) => a + b, 0) / 4;
  const cv = Math.sqrt(sizes.reduce((s, v) => s + (v - mean) ** 2, 0) / 4) / mean;
  if (cv > 0.4) return 0;
  const d = (a: Blob, b: Blob) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
  const top = d(q[0], q[1]), right = d(q[1], q[2]), bottom = d(q[2], q[3]), left = d(q[3], q[0]);
  const wAvg = (top + bottom) / 2, hAvg = (left + right) / 2;
  // the page may be photographed either way round, so accept ratio or its inverse
  const ratio = hAvg > wAvg ? hAvg / wAvg : wAvg / hAvg;
  if (Math.abs(ratio - PAGE_RATIO) / PAGE_RATIO > 0.3) return 0;
  // opposite sides must be similar (perspective allows some difference)
  if (Math.max(top, bottom) / Math.min(top, bottom) > 1.6 || Math.max(left, right) / Math.min(left, right) > 1.6) return 0;
  // convex: all cross products same sign
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cr = (b.cx - a.cx) * (c.cy - b.cy) - (b.cy - a.cy) * (c.cx - b.cx);
    const s = Math.sign(cr);
    if (sign && s !== sign) return 0;
    sign = s || sign;
  }
  let area = 0;
  for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; area += a.cx * b.cy - b.cx * a.cy; }
  return Math.abs(area) / 2;
}

/** 1 = clear white hole in the middle of a dark square, 0 = solid. Measured at full photo resolution. */
function holeScore(img: ImageData, cx: number, cy: number, side: number): number {
  const sample = (r0: number, r1: number) => {
    let s = 0, n = 0;
    const R = Math.ceil(r1);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dy);
      if (d < r0 || d > r1) continue;
      const x = Math.round(cx + dx), y = Math.round(cy + dy);
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      s += lum(img.data, (y * img.width + x) * 4); n++;
    }
    return n ? s / n : 0;
  };
  const centre = sample(0, side * 0.12);
  const body = sample(side * 0.33, side * 0.42);          // the black ring around the hole
  const paper = sample(side * 0.85, side * 1.15);
  if (paper - body < 20) return 0;
  return Math.max(0, Math.min(1, (centre - body) / (paper - body)));
}
