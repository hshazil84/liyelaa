import { lum } from "./image";
import { snapMark } from "./marks";
import { boxBlur3, traceField, type PxSeg } from "./trace";
import { LSB, UNITS_PER_MM, type CellResult, type Contour, type Glyph, type Layout, type LayoutCell } from "./types";

const INSET = 1.0;   // mm kept clear of the box border
const SPECK_MM2 = 0.3; // ink smaller than this (a printed tick, a grain of dust) is not part of the letter

function percentile(vals: Float32Array, p: number): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < vals.length; i++) hist[Math.max(0, Math.min(255, Math.round(vals[i])))]++;
  let acc = 0; const target = p * vals.length;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
  return 255;
}

/**
 * Even out the light across the sheet, so a shadow (a hand, a phone) is not mistaken for ink.
 * The paper brightness is read from every 5 mm block of the page (ink is thin, so most of a block is paper),
 * smoothed, and every pixel is measured against it.
 */
export function flatLuminance(sheet: ImageData, block = 40): Float32Array {
  const W = sheet.width, H = sheet.height;
  const gw = Math.ceil(W / block), gh = Math.ceil(H / block);
  const grid = new Float32Array(gw * gh);
  const hist = new Uint32Array(256);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    hist.fill(0);
    let n = 0;
    for (let y = gy * block; y < Math.min(H, (gy + 1) * block); y += 2) for (let x = gx * block; x < Math.min(W, (gx + 1) * block); x += 2) {
      hist[Math.max(0, Math.min(255, Math.round(lum(sheet.data, (y * W + x) * 4))))]++; n++;
    }
    let acc = 0, v = 255;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= 0.85 * n) { v = i; break; } }
    grid[gy * gw + gx] = v;
  }
  const sorted = Array.from(grid).sort((a, b) => a - b);
  const floor = 0.5 * sorted[Math.floor(sorted.length * 0.9)];        // a block that is all ink (a corner square) must not set the paper level
  for (let i = 0; i < grid.length; i++) grid[i] = Math.max(grid[i], floor);
  const smooth = new Float32Array(grid.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = gx + dx, y = gy + dy;
        if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
        s += grid[y * gw + x]; c++;
      }
      smooth[gy * gw + gx] = s / c;
    }
    grid.set(smooth);
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / block - 0.5)), y0 = Math.floor(fy), y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / block - 0.5)), x0 = Math.floor(fx), x1 = Math.min(gw - 1, x0 + 1), tx = fx - x0;
      const bg = (grid[y0 * gw + x0] * (1 - tx) + grid[y0 * gw + x1] * tx) * (1 - ty) + (grid[y1 * gw + x0] * (1 - tx) + grid[y1 * gw + x1] * tx) * ty;
      out[y * W + x] = Math.min(255, (lum(sheet.data, (y * W + x) * 4) / bg) * 235);
    }
  }
  return out;
}

/** Cut every box out of the straightened sheet, decide whether it holds ink, and trace it. */
export async function extractCells(sheet: ImageData, layout: Layout, sheetId: number, ppm = 8): Promise<CellResult[]> {
  const cells = layout.sheets.find((s) => s.id === sheetId)!.cells;
  const flat = flatLuminance(sheet);
  const out: CellResult[] = [];
  for (const cell of cells) out.push(await extractCell(sheet, flat, cell, layout, ppm));
  return out;
}

async function extractCell(sheet: ImageData, flat: Float32Array, cell: LayoutCell, layout: Layout, ppm: number): Promise<CellResult> {
  const base = { id: cell.id, cp: cell.cp, kind: cell.kind, label: cell.label };
  const x0 = Math.round((cell.x + INSET) * ppm), x1 = Math.round((cell.x + cell.w - INSET) * ppm);
  const y0 = Math.round((cell.y + 0.8) * ppm), y1 = Math.round((cell.y + cell.h - layout.guides.labelH - 0.4) * ppm);
  const w = x1 - x0, h = y1 - y0;
  const L = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) L[y * w + x] = flat[(y0 + y) * sheet.width + x0 + x];

  const paper = percentile(L, 0.8);
  const darkest = percentile(L, 0.002);
  const contrast = paper > 0 ? 1 - darkest / paper : 0;
  if (contrast < 0.2) return { ...base, status: "empty" };
  if (contrast < 0.5) return { ...base, status: "light" };

  const T = (paper + darkest) / 2;            // halfway between paper and the darkest ink
  let inkPixels = 0;
  for (let i = 0; i < L.length; i++) if (L[i] < T) inkPixels++;
  if (inkPixels < 25) return { ...base, status: "empty" };

  const dark = new Float32Array(w * h);
  for (let i = 0; i < dark.length; i++) dark[i] = Math.max(0, paper - L[i]);
  const rings = await traceField(boxBlur3(dark, w, h), w, h, paper - T, { minArea: SPECK_MM2 * ppm * ppm, relMinArea: 0.02, relBelow: 1.2 * ppm * ppm });
  if (!rings.length) return { ...base, status: "empty" };

  // Only the letter itself counts. A stray dark pixel from the printed box line or a shadow is dropped by the
  // tracing above, so it must not raise the warning either.
  let edge = false;
  for (const r of rings) for (const s of r) if (s.x < 2 || s.y < 2 || s.x >= w - 2) edge = true;

  const glyph = toGlyph(cell, rings, x0, y0, ppm, layout);
  return { ...base, status: "ok", glyph, warn: edge ? "Touches the edge of its box" : undefined };
}

function toGlyph(cell: LayoutCell, rings: PxSeg[][], x0: number, y0: number, ppm: number, layout: Layout): Glyph {
  const K = UNITS_PER_MM, baseY = layout.guides.baseY;
  const mmX = (px: number) => (x0 + px) / ppm - cell.x;
  const mmY = (py: number) => (y0 + py) / ppm - cell.y;
  let minX = Infinity, maxX = -Infinity;
  for (const r of rings) for (const s of r) { minX = Math.min(minX, mmX(s.x)); maxX = Math.max(maxX, mmX(s.x)); }
  const isMark = cell.kind === "fili";
  const originMm = isMark ? layout.placeholder.x + layout.placeholder.w / 2 : minX;
  const shift = isMark ? 0 : LSB;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const contours: Contour[] = rings.map((r) => r.map((s) => ({
    p: { x: r1((mmX(s.x) - originMm) * K + shift), y: r1((baseY - mmY(s.y)) * K) },
    hi: { x: r1((s.hix / ppm) * K), y: r1((-s.hiy / ppm) * K) },
    ho: { x: r1((s.hox / ppm) * K), y: r1((-s.hoy / ppm) * K) },
  })));
  const glyph: Glyph = {
    id: cell.id, cp: cell.cp, kind: cell.kind, contours,
    adv: isMark ? 0 : Math.round((maxX - minX) * K + 2 * LSB),
  };
  return isMark ? snapMark(glyph) : glyph;
}
