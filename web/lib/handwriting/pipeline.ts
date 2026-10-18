import layoutJson from "@/lib/template-layout.json";
import { extractCells } from "./cells";
import { findMarks } from "./corners";
import { imageDataToUrl, loadImage } from "./image";
import type { CellResult, Layout } from "./types";
import { warpToSheet } from "./warp";

export const layout = layoutJson as unknown as Layout;

export type PhotoOutcome =
  | { ok: false; reason: string }
  | {
      ok: true; sheetId: number; cells: CellResult[];
      originalUrl: string; straightenedUrl: string;
      counts: { ok: number; light: number; empty: number; edge: number; total: number };
    };

export async function processPhoto(file: Blob, sheetId: number): Promise<PhotoOutcome> {
  const img = await loadImage(file);
  const marks = findMarks(img);
  if (!marks.ok) return { ok: false, reason: marks.reason };
  const sheet = warpToSheet(img, marks.pts, layout, 8);
  const cells = await extractCells(sheet, layout, sheetId, 8);
  const counts = {
    ok: cells.filter((c) => c.status === "ok").length,
    light: cells.filter((c) => c.status === "light").length,
    empty: cells.filter((c) => c.status === "empty").length,
    edge: cells.filter((c) => c.warn).length,
    total: cells.length,
  };
  return { ok: true, sheetId, cells, originalUrl: imageDataToUrl(img, 900), straightenedUrl: imageDataToUrl(sheet, 700), counts };
}
