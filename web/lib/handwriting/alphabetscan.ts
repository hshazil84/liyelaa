import { withAlphabet } from "./alphabet";
import type { Glyph } from "./types";

export type AlphabetScan = { ok: false; reason: string } | { ok: true; glyphs: Glyph[]; message: string };

/** A photo of a printed alphabet sheet: every box with ink becomes that letter's drawing. */
export async function scanAlphabetSheet(file: Blob, sheetId: number): Promise<AlphabetScan> {
  const { processPhoto } = await import("./pipeline");
  const r = await processPhoto(file, sheetId, withAlphabet());
  if (!r.ok) return { ok: false, reason: r.reason };
  const glyphs = r.cells.flatMap((c) => (c.glyph ? [{ ...c.glyph, kind: "latin" as const, source: "photo" as const }] : []));
  const bits = [`${glyphs.length} letter${glyphs.length === 1 ? "" : "s"} added`];
  if (r.counts.light) bits.push(`${r.counts.light} too light`);
  if (r.counts.edge) bits.push(`${r.counts.edge} touching the box edge`);
  if (r.counts.empty) bits.push(`${r.counts.empty} empty`);
  return { ok: true, glyphs, message: bits.join(", ") + "." };
}
