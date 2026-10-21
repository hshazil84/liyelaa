import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Ligature } from "./extras";
import { joinedPages } from "./joined";
import { layout } from "./pipeline-layout";

const { guides, marks, markSize: MARK, page: PAGE } = layout;
const PT = 72 / 25.4;                       // points per millimetre
const grey = (n: number) => rgb(n / 255, n / 255, n / 255);

/** The reference letters are drawn by the browser, which shapes Thaana correctly, and placed in the PDF as small transparent images. */
async function labelImage(text: string): Promise<{ png: Uint8Array; w: number; h: number } | null> {
  const FONT_PT = 19, S = 10;
  try {
    const face = new FontFace("ThPdf", "url(/fonts/AKRasmee-2.0.woff2)");
    await face.load();
    document.fonts.add(face);
  } catch { /* fall through to the system font */ }
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const px = FONT_PT * S;
  ctx.font = `${px}px ThPdf, serif`;
  const m = ctx.measureText(text);
  const asc = m.fontBoundingBoxAscent ?? px * 0.95, desc = m.fontBoundingBoxDescent ?? px * 0.45;
  c.width = Math.max(1, Math.ceil(m.width) + 4);
  c.height = Math.max(1, Math.ceil(asc + desc));
  const g = c.getContext("2d")!;
  g.font = `${px}px ThPdf, serif`;
  g.fillStyle = "#8c8c8c";
  g.textBaseline = "alphabetic";
  g.fillText(text, 2, asc);
  const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/png"));
  if (!blob) return null;
  return { png: new Uint8Array(await blob.arrayBuffer()), w: c.width / S, h: c.height / S };
}

type Run = { t: string; bold: boolean };

function wrap(runs: Run[], regular: PDFFont, bold: PDFFont, size: number, maxW: number): Run[][] {
  const words: Run[] = runs.flatMap((r) => r.t.split(/\s+/).filter(Boolean).map((t) => ({ t, bold: r.bold })));
  const lines: Run[][] = [[]];
  let w = 0;
  const space = regular.widthOfTextAtSize(" ", size);
  for (const word of words) {
    const ww = (word.bold ? bold : regular).widthOfTextAtSize(word.t, size);
    if (lines[lines.length - 1].length && w + space + ww > maxW) { lines.push([]); w = 0; }
    w += (lines[lines.length - 1].length ? space : 0) + ww;
    lines[lines.length - 1].push(word);
  }
  return lines;
}

/** A printable PDF with one box for each joined letter, built in the browser. 36 boxes to a page, sheets numbered from 3. */
export async function makeJoinedPdf(ligs: Ligature[]): Promise<Blob> {
  const pages = joinedPages(ligs);
  const total = 2 + pages.length;
  const doc = await PDFDocument.create();
  doc.setTitle("MyAkuru joined letters");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const images = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();
  const sizes = new Map<string, { w: number; h: number }>();
  for (const pg of pages) for (const c of pg.cells) {
    if (images.has(c.label)) continue;
    const li = await labelImage(c.label);
    if (!li) continue;
    images.set(c.label, await doc.embedPng(li.png));
    sizes.set(c.label, { w: li.w, h: li.h });
  }

  for (const pg of pages) {
    const page = doc.addPage([PAGE.w * PT, PAGE.h * PT]);
    const H = PAGE.h * PT;
    const X = (mm: number) => mm * PT, Y = (mm: number) => H - mm * PT;

    // corner marks for the scan: solid black, the top left one with a hole
    for (const m of marks) {
      page.drawRectangle({ x: X(m.cx - MARK / 2), y: Y(m.cy + MARK / 2), width: MARK * PT, height: MARK * PT, color: rgb(0, 0, 0) });
      if (m.hole) page.drawRectangle({ x: X(m.cx - MARK / 2 + 2.2), y: Y(m.cy - MARK / 2 + 2.2 + 2.6), width: 2.6 * PT, height: 2.6 * PT, color: rgb(1, 1, 1) });
    }

    page.drawText("MyAkuru", { x: X(20), y: Y(11) - 10, size: 12, font: bold, color: grey(34) });
    page.drawText(`${String.fromCharCode(0xb7)}  Joined letters`, { x: X(20) + bold.widthOfTextAtSize("MyAkuru", 12) + 6, y: Y(11) - 10, size: 12, font: regular, color: grey(34) });
    const pn = `Sheet ${pg.id} of ${total}`;
    page.drawText(pn, { x: X(190) - regular.widthOfTextAtSize(pn, 10), y: Y(11) - 10, size: 10, font: regular, color: grey(102) });

    const tip: Run[] = [
      { t: "Write the whole joined shape inside its box, sitting on the solid", bold: false }, { t: "baseline,", bold: true },
      { t: "including any vowel marks that belong to it. Skip any you don't want. Keep the sheet flat, in daylight, and don't cover the four black squares in the corners.", bold: false },
    ];
    wrap(tip, regular, bold, 9, 180 * PT).forEach((line, i) => {
      let x = X(15);
      for (const r of line) {
        const f = r.bold ? bold : regular;
        page.drawText(r.t, { x, y: Y(19) - 8 - i * 13.05, size: 9, font: f, color: grey(68) });
        x += f.widthOfTextAtSize(r.t + " ", 9);
      }
    });

    for (const c of pg.cells) {
      const bx = c.x, by = c.y;
      page.drawRectangle({ x: X(bx), y: Y(by + c.h), width: c.w * PT, height: c.h * PT, borderColor: grey(207), borderWidth: 0.3 * PT });
      page.drawLine({ start: { x: X(bx), y: Y(by + guides.topY) }, end: { x: X(bx + c.w), y: Y(by + guides.topY) }, thickness: 0.25 * PT, color: grey(226), dashArray: [1.5 * PT, 1 * PT] });
      page.drawLine({ start: { x: X(bx), y: Y(by + guides.baseY) }, end: { x: X(bx + c.w), y: Y(by + guides.baseY) }, thickness: 0.35 * PT, color: grey(216) });
      const labTop = by + c.h - guides.labelH;
      page.drawLine({ start: { x: X(bx), y: Y(labTop) }, end: { x: X(bx + c.w), y: Y(labTop) }, thickness: 0.25 * PT, color: grey(230) });
      const mid = Y(labTop + guides.labelH / 2);
      const img = images.get(c.label), sz = sizes.get(c.label);
      if (img && sz) page.drawImage(img, { x: X(bx + 1.5), y: mid - sz.h / 2, width: sz.w, height: sz.h });
      const code = c.code ?? "";
      page.drawText(code, { x: X(bx + c.w - 1.5) - regular.widthOfTextAtSize(code, 6), y: mid - 2, size: 6, font: regular, color: grey(154) });
    }
  }
  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
