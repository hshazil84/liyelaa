import { del, get, set } from "idb-keyval";
import type { Glyph } from "./types";

const KEY = "dfm.handwriting.v1";

export type Project = { v: 1; glyphs: Record<string, Glyph>; updatedAt: number };

const empty = (): Project => ({ v: 1, glyphs: {}, updatedAt: Date.now() });

/** The project lives in this browser (IndexedDB). Photos are never stored, only the traced outlines. */
export async function loadProject(): Promise<Project> {
  try { return (await get<Project>(KEY)) ?? empty(); } catch { return empty(); }
}

export async function saveGlyphs(glyphs: Glyph[]): Promise<Project> {
  const p = await loadProject();
  for (const g of glyphs) p.glyphs[g.id] = g;
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

export async function clearProject(): Promise<void> {
  try { await del(KEY); } catch {}
}
