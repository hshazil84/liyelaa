import type { Layout, Pt } from "./types";

/** 3x3 matrix (row-major, h33 = 1) that maps each src point onto its dst point. */
export function homography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return [...x, 1];
}

export function applyH(H: number[], x: number, y: number): Pt {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/** Straighten the photographed sheet into a flat page, `ppm` pixels per millimetre. */
export function warpToSheet(img: ImageData, marks: Pt[], layout: Layout, ppm = 8): ImageData {
  const byId = Object.fromEntries(layout.marks.map((m) => [m.id, m]));
  const page = ["tl", "tr", "br", "bl"].map((id) => ({ x: byId[id].cx * ppm, y: byId[id].cy * ppm }));
  const H = homography(page, marks);          // page pixels -> photo pixels
  const W = Math.round(layout.page.w * ppm), Hh = Math.round(layout.page.h * ppm);
  const out = new ImageData(W, Hh);
  const src = img.data, sw = img.width, sh = img.height;
  for (let v = 0; v < Hh; v++) {
    for (let u = 0; u < W; u++) {
      const p = applyH(H, u, v);
      const o = (v * W + u) * 4;
      const x0 = Math.floor(p.x), y0 = Math.floor(p.y);
      if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) { out.data[o] = out.data[o + 1] = out.data[o + 2] = 255; out.data[o + 3] = 255; continue; }
      const fx = p.x - x0, fy = p.y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        out.data[o + c] = src[i00 + c] * (1 - fx) * (1 - fy) + src[i10 + c] * fx * (1 - fy) + src[i01 + c] * (1 - fx) * fy + src[i11 + c] * fx * fy;
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}
