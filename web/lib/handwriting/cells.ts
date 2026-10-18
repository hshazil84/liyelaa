import { lum } from "./image";
import { boxBlur3, traceField, type PxSeg } from "./trace";
import { LSB, UNITS_PER_MM, type CellResult, type Contour, type Glyph, type Layout, type LayoutCell } from "./types";

const INSET = 1.0;   // mm kept clear of the box border

function percentile(vals: Float32Array, p: number): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < vals.length; i++) hist[Math.max(0, Math.min(255, Math.round(vals[i])))]++;
  let acc = 0; const target = p * vals.length;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
  return 255;
}

/** Cut every box out of the straightened sheet, decide whether it holds ink, and trace it. */
export async function extractCells(sheet: ImageData, layout: Layout, sheetId: number, ppm = 8): Promise<CellResult[]> {
  const cells = layout.sheets.find((s) => s.id === sheetId)!.cells;
  const out: CellResult[] = [];
  for (const cell of cells) out.push(await extractCell(sheet, cell, layout, ppm));
  return out;
}

async function extractCell(sheet: ImageData, cell: LayoutCell, layout: Layout, ppm: number): Promise<CellResult> {
  const base = { id: cell.id, cp: cell.cp, kind: cell.kind, label: cell.label };
  const x0 = Math.round((cell.x + INSET) * ppm), x1 = Math.round((cell.x + cell.w - INSET) * ppm);
  const y0 = Math.round((cell.y + 0.8) * ppm), y1 = Math.round((cell.y + cell.h - layout.guides.labelH - 0.4) * ppm);
  const w = x1 - x0, h = y1 - y0;
  const L = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) L[y * w + x] = lum(sheet.data, ((y0 + y) * sheet.width + x0 + x) * 4);

  const paper = percentile(L, 0.8);
  const darkest = percentile(L, 0.002);
  const contrast = paper > 0 ? 1 - darkest / paper : 0;
  if (contrast < 0.2) return { ...base, status: "empty" };
  if (contrast < 0.5) return { ...base, status: "light" };

  const T = (paper + darkest) / 2;            // halfway between paper and the darkest ink
  let inkPixels = 0, edge = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (L[y * w + x] < T) {
      inkPixels++;
      if (x < 2 || y < 2 || x >= w - 2) edge = true;
    }
  }
  if (inkPixels < 25) return { ...base, status: "empty" };

  const dark = new Float32Array(w * h);
  for (let i = 0; i < dark.length; i++) dark[i] = Math.max(0, paper - L[i]);
  const rings = await traceField(boxBlur3(dark, w, h), w, h, paper - T);
  if (!rings.length) return { ...base, status: "empty" };

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
  return {
    id: cell.id, cp: cell.cp, kind: cell.kind, contours,
    adv: isMark ? 0 : Math.round((maxX - minX) * K + 2 * LSB),
  };
}
