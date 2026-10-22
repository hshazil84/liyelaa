import { saveBlob } from "@/lib/play";
import { addFont, fontTitle, loadProject, type Project } from "./store";

/**
 * A project file: the open font's letters, spacing and settings as one file the person keeps.
 * Photos are never stored, so they are not in it. Opening a file adds a new font and never replaces one.
 */
export const PROJECT_EXT = ".myakuru";
const MAX_BYTES = 40 * 1024 * 1024;

type FileBody = { app: "myakuru"; kind: "project"; v: 1; savedAt: number; project: Project };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
const pt = (x: unknown) => isObj(x) && num(x.x) && num(x.y);

function goodGlyph(g: unknown): boolean {
  if (!isObj(g) || typeof g.id !== "string" || !num(g.adv)) return false;
  if (!Array.isArray(g.cp) || !g.cp.every(num)) return false;
  if (g.kind !== "letter" && g.kind !== "fili" && g.kind !== "symbol") return false;
  return Array.isArray(g.contours) && g.contours.every((c) => Array.isArray(c) && c.every((s) => isObj(s) && pt(s.p) && pt(s.hi) && pt(s.ho)));
}
const numberMap = (x: unknown) => isObj(x) && Object.values(x).every(num);

/** Keep only what the app knows how to read, and only if it is the right shape. Anything odd is dropped, not trusted. */
function clean(raw: unknown): Project | null {
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.glyphs)) return null;
  const glyphs: Project["glyphs"] = {};
  for (const [id, g] of Object.entries(raw.glyphs)) { if (!goodGlyph(g)) return null; glyphs[id] = g as Project["glyphs"][string]; }
  const p: Project = { v: 1, glyphs, updatedAt: Date.now() };
  if (isObj(raw.originals) && Object.values(raw.originals).every(goodGlyph)) p.originals = raw.originals as Project["originals"];
  if (numberMap(raw.levelled)) p.levelled = raw.levelled as Project["levelled"];
  if (numberMap(raw.levelHand)) p.levelHand = raw.levelHand as Project["levelHand"];
  if (raw.levelMethod === "baseline" || raw.levelMethod === "middle") p.levelMethod = raw.levelMethod;
  if (isObj(raw.markOffsets)) p.markOffsets = raw.markOffsets as Project["markOffsets"];
  if (isObj(raw.spacing) && num(raw.spacing.all) && isObj(raw.spacing.side) && isObj(raw.spacing.pairs) && numberMap(raw.spacing.pairs)) p.spacing = raw.spacing as Project["spacing"];
  if (isObj(raw.info) && ["name", "designer", "website", "description", "version"].every((k) => typeof (raw.info as Record<string, unknown>)[k] === "string")) p.info = raw.info as Project["info"];
  if (raw.path === "photo" || raw.path === "draw") p.path = raw.path;
  if (Array.isArray(raw.ligatures) && raw.ligatures.every((l) => isObj(l) && typeof l.id === "string" && Array.isArray(l.sequence) && l.sequence.every(num) && goodGlyph(l.glyph))) p.ligatures = raw.ligatures as Project["ligatures"];
  if (isObj(raw.extras)) p.extras = raw.extras as Project["extras"];
  if (typeof raw.title === "string") p.title = raw.title.slice(0, 60);
  return p;
}

/** The open font as a file to download. */
export async function saveProjectFile(): Promise<string> {
  const p = await loadProject();
  const { fontId: _id, ...rest } = p;
  void _id;
  const body: FileBody = { app: "myakuru", kind: "project", v: 1, savedAt: Date.now(), project: rest as Project };
  const name = (fontTitle(p).replace(/[^A-Za-z0-9 \-]/g, "").trim().replace(/\s+/g, "-") || "My-font") + PROJECT_EXT;
  saveBlob(new Blob([JSON.stringify(body)], { type: "application/json" }), name);
  return name;
}

export type OpenResult = { ok: true; id: string; title: string } | { ok: false; reason: string };

/** Read a project file and add it as a new font. */
export async function openProjectFile(file: File): Promise<OpenResult> {
  const bad = (reason: string): OpenResult => ({ ok: false, reason });
  if (file.size > MAX_BYTES) return bad("That file is too big to be a MyAkuru project.");
  let body: unknown;
  try { body = JSON.parse(await file.text()); } catch { return bad(`That file is not a MyAkuru project. Choose a file ending in ${PROJECT_EXT}.`); }
  if (!isObj(body) || body.app !== "myakuru" || body.kind !== "project") return bad(`That file is not a MyAkuru project. Choose a file ending in ${PROJECT_EXT}.`);
  if (body.v !== 1) return bad("That project was saved by a newer version of MyAkuru. Reload the page and try again.");
  const project = clean(body.project);
  if (!project) return bad("That project file is damaged, so it was not opened.");
  const title = `${fontTitle(project)} (opened)`.slice(0, 60);
  try { return { ok: true, id: await addFont(project, title), title }; } catch (e) { return bad((e as Error).message); }
}
