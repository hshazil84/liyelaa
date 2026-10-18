import { BUILDER_URL, saveBlob, type BuildFormat } from "@/lib/play";
import { autoAnchor } from "./marks";
import { bake } from "./spacing";
import type { FontInfo, Project } from "./store";

export { saveBlob };
export type { BuildFormat };

export const DEFAULT_INFO: FontInfo = {
  name: "My Handwriting", designer: "", website: "", description: "", version: "1.000", licence: "ofl",
};

/** The 38 letters and 11 vowel marks the language needs. Everything else is an extra. */
export const NEEDED_LETTERS = Array.from({ length: 38 }, (_, i) => 0x0780 + i);
export const NEEDED_MARKS = Array.from({ length: 11 }, (_, i) => 0x07a6 + i);
export const cpId = (cp: number) => cp.toString(16).toUpperCase().padStart(4, "0");

export function cleanFontName(raw: string): string {
  return raw.replace(/[^A-Za-z0-9 \-]/g, "").slice(0, 40);
}

/** Same rules as the builder, so a mistake shows before anything is sent. */
export function infoProblems(i: FontInfo): { website?: string; version?: string } {
  const out: { website?: string; version?: string } = {};
  const w = i.website.trim();
  if (w) {
    if (/\s/.test(w)) out.website = "The website cannot have spaces in it.";
    else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(w) && !/^https?:\/\//i.test(w)) out.website = "Start the website with http:// or https://, or leave that off.";
    else if (!w.replace(/^https?:\/\//i, "").includes(".")) out.website = "That does not look like a website address.";
  }
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(i.version.trim())) out.version = "Use a version like 1.000.";
  return out;
}

/** True when the person drew every letter and mark, so the font does not need the open starter font at all. */
export function allMine(p: Project): boolean {
  const have = (cp: number) => !!p.glyphs[cpId(cp)]?.contours.length;
  return NEEDED_LETTERS.every(have) && NEEDED_MARKS.every(have);
}

export function buildBody(p: Project, info: FontInfo, format: BuildFormat) {
  const sp = p.spacing ?? { all: 0, side: {}, pairs: {} };
  const glyphs = bake(Object.values(p.glyphs).filter((g) => g.contours.length), sp).map((g) => ({
    id: g.id, cp: g.cp.slice(0, 1), contours: g.contours, adv: Math.round(g.adv),
  }));
  const kerning = Object.entries(sp.pairs).filter(([, v]) => v).map(([k, value]) => {
    const [left, right] = k.split("|");
    return { left, right, value };
  });
  // the builder puts a mark on the top or bottom of the letter box; the lift is the extra the page adds so the outlines do not touch
  const drawn = Object.values(p.glyphs).filter((g) => g.contours.length);
  const letters = drawn.filter((g) => g.cp[0] >= 0x0780 && g.cp[0] <= 0x07a5), marks = drawn.filter((g) => g.cp[0] >= 0x07a6 && g.cp[0] <= 0x07b0);
  const mark_offsets: { base: string; mark: string; dx: number; dy: number }[] = [];
  for (const l of letters) for (const m of marks) {
    const a = autoAnchor(l, m), raw = autoAnchor(l, m, false), o = p.markOffsets?.[`${l.id}|${m.id}`];
    if (!a || !raw) continue;
    const fit = (n: number) => Math.max(-400, Math.min(400, Math.round(n)));
    const dx = fit((o?.dx ?? 0) + a.x - raw.x), dy = fit((o?.dy ?? 0) + a.y - raw.y);
    if (dx || dy) mark_offsets.push({ base: l.id, mark: m.id, dx, dy });
  }
  return {
    name: cleanFontName(info.name).trim() || DEFAULT_INFO.name,
    author: info.designer.trim(),
    website: info.website.trim(),
    description: info.description.trim(),
    version: info.version.trim() || DEFAULT_INFO.version,
    licence: info.licence,
    fallback: info.licence === "private" ? "none" : "noto",
    glyphs, kerning, mark_offsets, spacing: sp.all, format,
  };
}

export type BuildResult = { blob: Blob; filename: string; filled: string[]; drawn: number };

export async function buildHandwritingFont(p: Project, info: FontInfo, format: BuildFormat, signal?: AbortSignal): Promise<BuildResult> {
  const res = await fetch(`${BUILDER_URL}/handwriting/build`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildBody(p, info, format)),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : Array.isArray(j.detail) ? String(j.detail[0]?.msg ?? "").replace(/^Value error, /, "") : "";
    } catch {}
    throw new Error(detail || (res.status === 413 ? "That project is too large to build." : "The font builder had a problem."));
  }
  const cd = res.headers.get("content-disposition") ?? "";
  return {
    blob: await res.blob(),
    filename: /filename="([^"]+)"/.exec(cd)?.[1] ?? `font.${format}`,
    filled: (res.headers.get("x-dfm-filled") ?? "").split(",").filter(Boolean),
    drawn: Number(res.headers.get("x-dfm-drawn") ?? 0),
  };
}
