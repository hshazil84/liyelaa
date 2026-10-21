import { del, get, set } from "idb-keyval";
import type { Levelled } from "./level";
import type { Offsets } from "./marks";
import type { Spacing } from "./spacing";
import type { Glyph } from "./types";

const KEY = "dfm.handwriting.v1";

export type Project = {
  v: 1; glyphs: Record<string, Glyph>; updatedAt: number;
  originals?: Record<string, Glyph>;     // the traced version of a letter, kept when it is first edited
  levelled?: Levelled;                   // how far each letter was moved by Level your letters, so it can be undone
  markOffsets?: Offsets;                 // hand adjustments, one per letter and vowel mark pair
  spacing?: Spacing;                     // letter spacing and pair adjustments
  info?: FontInfo;                       // name, designer and so on, for the export step
  path?: "photo" | "draw";               // which way in this project started, so the steps are named right
};

export type FontInfo = {
  name: string; designer: string; website: string; description: string; version: string; licence: "ofl" | "private";
};

const empty = (): Project => ({ v: 1, glyphs: {}, updatedAt: Date.now() });

/** The project lives in this browser (IndexedDB). Photos are never stored, only the traced outlines. */
export async function loadProject(): Promise<Project> {
  try { return (await get<Project>(KEY)) ?? empty(); } catch { return empty(); }
}

export async function saveGlyphs(glyphs: Glyph[], source: "photo" | "drawn" = "photo"): Promise<Project> {
  const p = await loadProject();
  p.path = source === "photo" ? "photo" : "draw";
  for (const g of glyphs) {
    p.glyphs[g.id] = { ...g, source };
    if (p.originals) delete p.originals[g.id];      // a fresh photo replaces the old trace
    if (p.levelled) delete p.levelled[g.id];
  }
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

export async function clearProject(): Promise<void> {
  try { await del(KEY); } catch {}
}

/** Save one edited letter. The first time a traced letter is edited its traced version is kept, so it can be restored. */
export async function updateGlyph(g: Glyph): Promise<Project> {
  const p = await loadProject();
  const before = p.glyphs[g.id];
  if (before?.source === "photo" && !p.originals?.[g.id]) p.originals = { ...p.originals, [g.id]: before };
  p.glyphs[g.id] = g;
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

export async function removeGlyph(id: string): Promise<Project> {
  const p = await loadProject();
  delete p.glyphs[id];
  if (p.originals) delete p.originals[id];
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

/** Save letters that were moved to the baseline, with how far each moved. Marks keep their own offsets, which follow the letter. */
export async function saveLevelled(glyphs: Record<string, Glyph>, levelled: Levelled): Promise<Project> {
  const p = await loadProject();
  for (const id of Object.keys(levelled).concat(Object.keys(p.levelled ?? {}))) if (glyphs[id]) p.glyphs[id] = glyphs[id];
  p.levelled = levelled;
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

export async function saveMarkOffsets(markOffsets: Offsets): Promise<Project> {
  const p = await loadProject();
  p.markOffsets = markOffsets;
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

export async function saveSpacing(spacing: Spacing): Promise<Project> {
  const p = await loadProject();
  p.spacing = spacing;
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

export async function saveInfo(info: FontInfo): Promise<Project> {
  const p = await loadProject();
  p.info = info;
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

/** Remember which way in the project started, for example when someone opens a blank letter without importing anything. */
export async function setPath(path: "photo" | "draw"): Promise<Project> {
  const p = await loadProject();
  p.path = path;
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}
