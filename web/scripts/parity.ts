// Run: npx tsx scripts/parity.ts <project.json> <out.json>
// Writes the request the browser would send to the builder, and where the page's own layout puts every glyph.
import { readFileSync, writeFileSync } from "node:fs";
import { buildBody, DEFAULT_INFO } from "../lib/handwriting/build";
import { layoutLine } from "../lib/handwriting/spacing";
import { emptySpacing } from "../lib/handwriting/spacing";
import { inkBox } from "../lib/handwriting/marks";

const project = JSON.parse(readFileSync(process.argv[2], "utf8"));
const body = buildBody(project, { ...DEFAULT_INFO, name: "Parity", licence: "ofl" }, "ttf");
const words: string[] = ["ދިވެހިބަސް", "ދިވެހިރާއްޖެ", "ގައުމީ މަޖިލިސް", "ބުޅި ބޮޑު ހިތް"];
const out: Record<string, unknown[]> = {};
for (const w of words) {
  const line = layoutLine(w, project.glyphs, project.markOffsets ?? {}, project.spacing ?? emptySpacing());
  out[w] = line.parts.map((p) => {
    const b = inkBox(p.glyph)!;
    return { id: p.glyph.id, x0: b.x0 + p.x, y0: b.y0 + p.y, x1: b.x1 + p.x, y1: b.y1 + p.y };
  });
}
writeFileSync(process.argv[3], JSON.stringify({ body, layout: out }));
