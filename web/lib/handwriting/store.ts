import { del, get, set } from "idb-keyval";
import type { Extras, Ligature } from "./extras";
import type { Levelled } from "./level";
import type { Offsets } from "./marks";
import type { Spacing } from "./spacing";
import type { TailSettings } from "./tails";
import type { Glyph } from "./types";

const KEY = "dfm.handwriting.v1";
/** Tells the header, if it is on screen, that the list of fonts or a count changed. */
const changed = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("thaanafont-fonts")); };

export type Project = {
  v: 1; glyphs: Record<string, Glyph>; updatedAt: number;
  originals?: Record<string, Glyph>;     // the traced version of a letter, kept when it is first edited
  levelled?: Levelled;                   // how far each letter was moved by Level your letters, so it can be undone
  levelHand?: Levelled;                  // the part of each letter's move the person made with the nudge buttons
  levelMethod?: "baseline" | "middle";    // how Snap finds each letter's place
  tails?: TailSettings;                  // the cursive tail style chosen on the Tails step
  tailBase?: Record<string, Glyph>;      // each letter as it was before tails, so tails can be changed or undone
  tailLev?: Levelled;                    // where Level had each letter when tailBase was taken
  markOffsets?: Offsets;                 // hand adjustments, one per letter and vowel mark pair
  spacing?: Spacing;                     // letter spacing and pair adjustments
  info?: FontInfo;                       // name, designer and so on, for the export step
  path?: "photo" | "draw";               // which way in this project started, so the steps are named right
  ligatures?: Ligature[];                // letter combinations drawn as one shape
  extras?: Extras;                       // choices about signs and punctuation
  fontId?: string;                       // which of the person's fonts this is
  title?: string;                        // what the person calls it, shown in the header and on My fonts
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
    if (p.levelHand) delete p.levelHand[g.id];
    if (p.tailBase) delete p.tailBase[g.id];
  }
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

/** English letters read from a photo of the alphabet sheet. Added beside the Thaana letters; the font stays on the path it was on. */
export async function saveAlphabet(glyphs: Glyph[]): Promise<Project> {
  const p = await loadProject();
  for (const g of glyphs) p.glyphs[g.id] = { ...g, kind: "latin", source: "photo" };
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

/** Start over: the letters go, the font keeps its name. */
export async function clearProject(): Promise<void> {
  try {
    const p = await get<Project>(KEY);
    if (p?.fontId || p?.title) await set(KEY, { v: 1, glyphs: {}, updatedAt: Date.now(), fontId: p.fontId, title: p.title } as Project);
    else await del(KEY);
  } catch {}
}

/** Save one edited letter. The first time a traced letter is edited its traced version is kept, so it can be restored. */
export async function updateGlyph(g: Glyph): Promise<Project> {
  const p = await loadProject();
  const before = p.glyphs[g.id];
  if (before?.source === "photo" && !p.originals?.[g.id]) p.originals = { ...p.originals, [g.id]: before };
  p.glyphs[g.id] = g;
  if (p.tailBase) delete p.tailBase[g.id];           // an edit after tails keeps the tail as it is drawn
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

export async function removeGlyph(id: string): Promise<Project> {
  const p = await loadProject();
  delete p.glyphs[id];
  if (p.originals) delete p.originals[id];
  if (p.tailBase) delete p.tailBase[id];
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  changed();
  return p;
}

/** Save letters that were moved to the baseline, with how far each moved. Marks keep their own offsets, which follow the letter. */
export async function saveLevelled(glyphs: Record<string, Glyph>, levelled: Levelled, extra: { hand?: Levelled; method?: "baseline" | "middle" } = {}): Promise<Project> {
  const p = await loadProject();
  for (const id of Object.keys(levelled).concat(Object.keys(p.levelled ?? {}))) if (glyphs[id]) p.glyphs[id] = glyphs[id];
  p.levelled = levelled;
  if (extra.hand) p.levelHand = extra.hand;
  if (extra.method) p.levelMethod = extra.method;
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

/** Save the letters with their tails, and what is needed to change or undo the tails. With no `tails` the letters go back to how they were and the tail record is dropped. */
export async function saveTails(glyphs: Record<string, Glyph>, tails: TailSettings | null, base: Record<string, Glyph> | null, lev: Levelled | null): Promise<Project> {
  const p = await loadProject();
  for (const id of Object.keys(glyphs)) if (p.glyphs[id]) p.glyphs[id] = glyphs[id];
  if (tails && base) { p.tails = tails; p.tailBase = base; p.tailLev = lev ?? {}; }
  else { delete p.tails; delete p.tailBase; delete p.tailLev; }
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

export async function saveExtras(extras: Extras): Promise<Project> {
  const p = await loadProject();
  p.extras = extras;
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

/** Add a ligature, or replace the one with the same id. */
export async function saveLigature(l: Ligature): Promise<Project> {
  const p = await loadProject();
  const rest = (p.ligatures ?? []).filter((x) => x.id !== l.id);
  p.ligatures = [...rest, l].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

/** Add or replace several joined letters in one write, so adding a whole family at once cannot overwrite itself. */
export async function saveLigatures(ls: Ligature[]): Promise<Project> {
  const p = await loadProject();
  const ids = new Set(ls.map((l) => l.id));
  p.ligatures = [...(p.ligatures ?? []).filter((x) => !ids.has(x.id)), ...ls].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}

export async function removeLigature(id: string): Promise<Project> {
  const p = await loadProject();
  p.ligatures = (p.ligatures ?? []).filter((x) => x.id !== id);
  p.updatedAt = Date.now();
  try { await set(KEY, p); } catch {}
  return p;
}


// ---------------------------------------------------------------- several fonts
/*
 * The font being worked on always lives under KEY, so every function above works on it without knowing about the others.
 * The other fonts are parked under their own keys, and a small index lists them in the order they were made.
 * Switching parks the open font and brings the chosen one into KEY.
 */
const INDEX = "dfm.fonts.v1";
const fontKey = (id: string) => `dfm.font.${id}`;
type Index = { v: 1; ids: string[] };

export const DEFAULT_TITLE = "My font";
export type FontMeta = { id: string; title: string; count: number; path?: "photo" | "draw"; updatedAt: number; active: boolean };

const newId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const readIndex = async (): Promise<Index> => { try { return (await get<Index>(INDEX)) ?? { v: 1, ids: [] }; } catch { return { v: 1, ids: [] }; } };
const writeIndex = async (idx: Index) => { try { await set(INDEX, idx); } catch {} };

/** A font nobody has touched: no letters, no name, no joined letters. */
export const isBlank = (p: Project) => !Object.keys(p.glyphs).length && !p.title && !p.ligatures?.length && !p.info;
export const fontTitle = (p: Project) => p.title?.trim() || p.info?.name?.trim() || DEFAULT_TITLE;

const metaOf = (p: Project, id: string, active: boolean): FontMeta =>
  ({ id, title: fontTitle(p), count: Object.values(p.glyphs).filter((g) => g.kind === "letter").length, path: p.path, updatedAt: p.updatedAt, active });

/** The open font, with an id so it can be told apart from the others. */
async function ensureActive(): Promise<Project> {
  const p = await loadProject();
  if (!p.fontId) { p.fontId = newId(); try { await set(KEY, p); } catch {} }
  const idx = await readIndex();
  if (!idx.ids.includes(p.fontId)) await writeIndex({ ...idx, ids: [...idx.ids, p.fontId] });
  return p;
}

/** Put the open font away, or drop it if nothing was ever done in it. */
async function parkOrDrop(cur: Project) {
  const idx = await readIndex();
  if (isBlank(cur)) { await writeIndex({ ...idx, ids: idx.ids.filter((i) => i !== cur.fontId) }); return; }
  try { await set(fontKey(cur.fontId!), cur); } catch {}
}

async function bringIn(p: Project, id: string) {
  try { await set(KEY, { ...p, fontId: id }); } catch {}
  const idx = await readIndex();
  if (!idx.ids.includes(id)) await writeIndex({ ...idx, ids: [...idx.ids, id] });
}

export async function listFonts(): Promise<FontMeta[]> {
  const cur = await loadProject();
  const idx = await readIndex();
  const curId = cur.fontId ?? "current";
  const out: FontMeta[] = [];
  const ids = idx.ids.includes(curId) ? idx.ids : [curId, ...idx.ids];
  for (const id of ids) {
    if (id === curId) { out.push(metaOf(cur, id, true)); continue; }
    try { const p = await get<Project>(fontKey(id)); if (p) out.push(metaOf(p, id, false)); } catch {}
  }
  return out;
}

export async function switchFont(id: string): Promise<boolean> {
  const cur = await ensureActive();
  if (cur.fontId === id) return true;
  let target: Project | undefined;
  try { target = await get<Project>(fontKey(id)); } catch {}
  if (!target) return false;
  await parkOrDrop(cur);
  await bringIn(target, id);
  try { await del(fontKey(id)); } catch {}
  changed();
  return true;
}

export async function createFont(title: string, path: "photo" | "draw"): Promise<string> {
  const cur = await ensureActive();
  await parkOrDrop(cur);
  const id = newId();
  await bringIn({ v: 1, glyphs: {}, updatedAt: Date.now(), title: title.trim() || DEFAULT_TITLE, path }, id);
  changed();
  return id;
}

/** Add a font that came from a project file, without opening it or touching the one being worked on. */
export async function addFont(p: Project, title: string): Promise<string> {
  await ensureActive();
  const id = newId();
  try { await set(fontKey(id), { ...p, fontId: id, title, updatedAt: Date.now() }); } catch { throw new Error("This browser would not save the font."); }
  const idx = await readIndex();
  await writeIndex({ ...idx, ids: [...idx.ids, id] });
  changed();
  return id;
}

export async function renameFont(id: string, title: string): Promise<void> {
  const name = title.trim().slice(0, 60);
  if (!name) return;
  try {
    const cur = await get<Project>(KEY);
    if (cur && (cur.fontId === id || (!cur.fontId && id === "current"))) { await set(KEY, { ...cur, title: name }); changed(); return; }
    const p = await get<Project>(fontKey(id));
    if (p) await set(fontKey(id), { ...p, title: name });
  } catch {}
  changed();
}

export async function deleteFont(id: string): Promise<void> {
  const idx = await readIndex();
  const rest = idx.ids.filter((i) => i !== id);
  let cur: Project | undefined;
  try { cur = await get<Project>(KEY); } catch {}
  const isOpen = !!cur && (cur.fontId === id || (!cur.fontId && id === "current"));
  try { await del(fontKey(id)); } catch {}
  await writeIndex({ ...idx, ids: rest });
  if (isOpen) {
    let done = false;
    for (const other of rest) {
      let p: Project | undefined;
      try { p = await get<Project>(fontKey(other)); } catch {}
      if (p) { await bringIn(p, other); try { await del(fontKey(other)); } catch {} done = true; break; }
    }
    if (!done) { try { await del(KEY); } catch {} }
  }
  changed();
}

/** One font as text, to keep as a backup file. */
export async function exportFont(id: string): Promise<{ filename: string; text: string } | null> {
  let p: Project | undefined;
  try {
    const cur = await get<Project>(KEY);
    p = cur && (cur.fontId === id || (!cur.fontId && id === "current")) ? cur : await get<Project>(fontKey(id));
  } catch {}
  if (!p) return null;
  const title = fontTitle(p);
  const text = JSON.stringify({ app: "thaanafont", kind: "font", v: 1, title, project: { ...p, fontId: undefined } });
  return { filename: `${title.replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "-") || "font"}.thaanafont`, text };
}

/** Open a backup file as a new font. The open font is put away first. Files from "Save project file" open here too. */
export async function importFont(text: string): Promise<{ ok: true; title: string } | { ok: false; reason: string }> {
  let data: { app?: string; kind?: string; title?: string; project?: Project };
  try { data = JSON.parse(text); } catch { return { ok: false, reason: "That is not a ThaanaFont backup file." }; }
  if (typeof data.app !== "string" || !["thaanafont", "myakuru"].includes(data.app) || (data.kind !== "font" && data.kind !== "project") || !data.project || typeof data.project.glyphs !== "object") {
    return { ok: false, reason: "That is not a ThaanaFont backup file." };
  }
  const cur = await ensureActive();
  await parkOrDrop(cur);
  const title = (data.title || data.project.title || DEFAULT_TITLE).slice(0, 60);
  await bringIn({ ...data.project, title, updatedAt: Date.now() }, newId());
  changed();
  return { ok: true, title };
}

/** How many of the letters in a font came from a photo and how many were drawn or imported. */
export function sourceMix(p: Project): { photo: number; drawn: number } {
  let photo = 0, drawn = 0;
  for (const g of Object.values(p.glyphs)) { if (g.source === "drawn") drawn++; else photo++; }
  return { photo, drawn };
}
