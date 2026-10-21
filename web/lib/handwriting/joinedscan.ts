import type { Ligature } from "./extras";
import { withJoined } from "./joined";

export type JoinedScan = { ok: false; reason: string } | { ok: true; changed: Ligature[]; message: string };

/** A photo of the printed joined-letters sheet: every box with ink becomes that joined letter's drawing. */
export async function scanJoinedSheet(file: Blob, ligs: Ligature[], sheetId: number): Promise<JoinedScan> {
  const { processPhoto } = await import("./pipeline");
  const r = await processPhoto(file, sheetId, withJoined(ligs));
  if (!r.ok) return { ok: false, reason: r.reason };
  const found = new Map(r.cells.flatMap((c) => (c.glyph ? [[c.id, c.glyph] as const] : [])));
  const changed = ligs.flatMap((l) => {
    const g = found.get(l.id);
    return g ? [{ ...l, glyph: { ...g, id: l.id, cp: l.sequence, kind: "letter" as const, source: "photo" as const } }] : [];
  });
  const bits = [`${changed.length} joined shape${changed.length === 1 ? "" : "s"} added`];
  if (r.counts.light) bits.push(`${r.counts.light} too light`);
  if (r.counts.edge) bits.push(`${r.counts.edge} touching the box edge`);
  if (r.counts.empty) bits.push(`${r.counts.empty} empty`);
  return { ok: true, changed, message: bits.join(", ") + "." };
}
