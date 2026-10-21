import { BUILDER_URL } from "@/lib/play";
import { inkBox, snapMark } from "./marks";
import { REFERENCE } from "./reference";
import { LSB, UNITS_PER_MM, type Contour, type Glyph, type Layout, type LayoutCell, type Seg } from "./types";

/**
 * Bring in vector artwork. SVG files are read with paper.js. Shapes become closed outlines, strokes are
 * reported (and can be outlined by the builder), and every letter is placed on the template's size and baseline.
 */

// ---------------------------------------------------------------- reading one SVG
type V = { x: number; y: number };
type PSeg = { point: V; handleIn: V; handleOut: V };
type PItem = {
  className: string; children?: PItem[]; segments?: PSeg[]; closed?: boolean; visible?: boolean; clipMask?: boolean;
  fillColor?: { red: number; green: number; blue: number; alpha?: number } | null;
  strokeColor?: unknown; strokeWidth?: number;
  globalMatrix: { transform(p: unknown): V };
};
type Paper = {
  setup(canvas: HTMLCanvasElement): void;
  Point: new (x: number, y: number) => unknown;
  project: { importSVG(svg: SVGElement, opts: { expandShapes: boolean; insert: boolean }): PItem };
};

let paperPromise: Promise<Paper> | null = null;
async function getPaper(): Promise<Paper> {
  if (!paperPromise) {
    paperPromise = import("paper/dist/paper-core").then((m) => {
      const paper = ((m as unknown as { default?: Paper }).default ?? m) as unknown as Paper;
      paper.setup(document.createElement("canvas"));
      return paper;
    });
  }
  return paperPromise;
}

export type Stroke = { width: number; closed: boolean; segs: Seg[] };
export type Box = { x: number; y: number; w: number; h: number };

/** What one SVG holds. Coordinates are SVG user units, y down. */
export type Art = {
  contours: Contour[];      // filled shapes
  strokes: Stroke[];        // lines with a width and no fill
  text: number;             // text objects that were not converted to outlines
  viewBox: Box | null;
};

export type ReadResult = { ok: true; art: Art } | { ok: false; reason: string };

const isWhite = (c: PItem["fillColor"]) => !!c && c.red >= 0.98 && c.green >= 0.98 && c.blue >= 0.98;

export async function readSvg(text: string): Promise<ReadResult> {
  const doc = new DOMParser().parseFromString(text.trim(), "image/svg+xml");
  const el = doc.documentElement;
  if (!el || el.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
    return { ok: false, reason: "That is not an SVG file." };
  }
  const paper = await getPaper();
  let root: PItem;
  try {
    root = paper.project.importSVG(el as unknown as SVGElement, { expandShapes: true, insert: false });
  } catch {
    return { ok: false, reason: "I could not read that SVG." };
  }

  let viewBox: Box | null = null;
  const vb = el.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) viewBox = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  else {
    const w = parseFloat(el.getAttribute("width") ?? ""), h = parseFloat(el.getAttribute("height") ?? "");
    if (w > 0 && h > 0) viewBox = { x: 0, y: 0, w, h };
  }

  const art: Art = { contours: [], strokes: [], text: 0, viewBox };
  const toSegs = (item: PItem): Seg[] => {
    const m = item.globalMatrix;
    return (item.segments ?? []).map((s) => {
      const p = m.transform(new paper.Point(s.point.x, s.point.y));
      const hi = m.transform(new paper.Point(s.point.x + s.handleIn.x, s.point.y + s.handleIn.y));
      const ho = m.transform(new paper.Point(s.point.x + s.handleOut.x, s.point.y + s.handleOut.y));
      return { p: { x: p.x, y: p.y }, hi: { x: hi.x - p.x, y: hi.y - p.y }, ho: { x: ho.x - p.x, y: ho.y - p.y } };
    });
  };
  const bbox = (segs: Seg[]) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of segs) { x0 = Math.min(x0, s.p.x); x1 = Math.max(x1, s.p.x); y0 = Math.min(y0, s.p.y); y1 = Math.max(y1, s.p.y); }
    return { x0, y0, x1, y1 };
  };
  const isBackground = (segs: Seg[]) => {
    if (!viewBox) return false;
    const b = bbox(segs);
    return (b.x1 - b.x0) >= 0.9 * viewBox.w && (b.y1 - b.y0) >= 0.9 * viewBox.h;
  };

  const walk = (item: PItem) => {
    if (item.visible === false || item.clipMask) return;
    if (item.className === "PointText") { art.text++; return; }
    if (item.className === "Path" || item.className === "CompoundPath") {
      const parts = item.className === "CompoundPath" ? (item.children ?? []) : [item];
      const hasFill = !!item.fillColor;
      const hasStroke = !!item.strokeColor && (item.strokeWidth ?? 0) > 0;
      if (hasFill && isWhite(item.fillColor)) return;                    // a white backing shape, not ink
      for (const part of parts) {
        const segs = toSegs(part);
        if (segs.length < 2) continue;
        if (hasFill || !hasStroke) {
          if (isBackground(segs)) continue;
          art.contours.push(segs);
        } else {
          art.strokes.push({ width: item.strokeWidth ?? 1, closed: !!part.closed, segs });
        }
      }
      return;
    }
    (item.children ?? []).forEach(walk);
  };
  walk(root);
  return { ok: true, art };
}

// ---------------------------------------------------------------- strokes to outlines (the builder does the geometry)
export async function outlineStrokes(strokes: Stroke[]): Promise<Contour[]> {
  const res = await fetch(`${BUILDER_URL}/svg/outline`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ strokes }),
  });
  if (!res.ok) throw new Error("The font builder could not outline those strokes.");
  return ((await res.json()) as { contours: Contour[] }).contours;
}

// ---------------------------------------------------------------- placing letters
export type ImportItem = {
  id: string; file: string;
  status: "ok" | "fix";
  reason?: string;
  glyph?: Glyph;
  strokes?: number;        // how many stroked lines were found, when status is fix because of strokes
};

export type ImportReport = {
  items: Record<string, ImportItem>;
  unmatched: string[];     // file names that are not a letter code
};

export type SizeMode = "fit" | "em";

export type SourceFile = { name: string; text: string };

const ID_RE = /(?:U\+|u|uni)?([0-9A-Fa-f]{4,5})(?=\D|$)/;
export function idFromName(name: string): string | null {
  const base = name.replace(/\.svg$/i, "");
  const m = ID_RE.exec(base);
  if (!m) return null;
  return m[1].toUpperCase().padStart(4, "0");
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const r1 = (n: number) => Math.round(n * 10) / 10;

type Raw = { id: string; cell: LayoutCell; contours: Contour[] };     // y up, svg units

const flipY = (cs: Contour[]): Contour[] => cs.map((c) => c.map((s) => ({ p: { x: s.p.x, y: -s.p.y }, hi: { x: s.hi.x, y: -s.hi.y }, ho: { x: s.ho.x, y: -s.ho.y } })));
const mapContours = (cs: Contour[], f: (p: { x: number; y: number }) => { x: number; y: number }, k: number): Contour[] =>
  cs.map((c) => c.map((s) => ({ p: f(s.p), hi: { x: r1(s.hi.x * k), y: r1(s.hi.y * k) }, ho: { x: r1(s.ho.x * k), y: r1(s.ho.y * k) } })));

function allCells(layout: Layout): Map<string, LayoutCell> {
  const m = new Map<string, LayoutCell>();
  for (const sh of layout.sheets) for (const c of sh.cells) m.set(c.id, c);
  return m;
}

/** One SVG per letter, named by its code (U+0780.svg, 0780.svg). Size and baseline are worked out from the letters as a set. */
export async function importFiles(files: SourceFile[], layout: Layout, mode: SizeMode, outline: boolean): Promise<ImportReport> {
  const cells = allCells(layout);
  const items: Record<string, ImportItem> = {};
  const unmatched: string[] = [];
  const raws: Raw[] = [];
  let vbHeight = 0;

  for (const f of files) {
    const id = idFromName(f.name);
    const cell = id ? cells.get(id) : undefined;
    if (!id || !cell) { unmatched.push(f.name); continue; }
    const r = await readSvg(f.text);
    if (!r.ok) { items[id] = { id, file: f.name, status: "fix", reason: r.reason }; continue; }
    const { art } = r;
    let contours = art.contours;
    if (art.strokes.length && outline) {
      try { contours = contours.concat(await outlineStrokes(art.strokes)); }
      catch (e) { items[id] = { id, file: f.name, status: "fix", reason: (e as Error).message, strokes: art.strokes.length }; continue; }
    } else if (art.strokes.length && !contours.length) {
      items[id] = { id, file: f.name, status: "fix", reason: "Strokes found. Fonts need filled shapes.", strokes: art.strokes.length };
      continue;
    }
    if (!contours.length) {
      items[id] = { id, file: f.name, status: "fix", reason: art.text ? "Text found. Convert the text to outlines first." : "No shapes found in this file." };
      continue;
    }
    if (art.viewBox && !vbHeight) vbHeight = art.viewBox.h;
    raws.push({ id, cell, contours: flipY(contours) });
    if (art.strokes.length && !outline) items[id] = { id, file: f.name, status: "ok", strokes: art.strokes.length };
  }

  placeAll(raws, layout, mode, vbHeight, f2n(files), items);
  return { items, unmatched };
}

const f2n = (files: SourceFile[]) => new Map(files.map((f) => [idFromName(f.name) ?? "", f.name]));

function placeAll(raws: Raw[], layout: Layout, mode: SizeMode, vbHeight: number, names: Map<string, string>, items: Record<string, ImportItem>) {
  const box = (cs: Contour[]) => inkBox({ contours: cs } as Glyph) ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
  // 1. size: either the template's letter size, or the artboard as a 1000 unit em square
  let k = 1;
  const letters = raws.filter((r) => r.cell.kind === "letter" && REFERENCE[r.id]);
  if (mode === "em" && vbHeight > 0) k = 1000 / vbHeight;
  else if (letters.length >= 3) {
    k = 1 / (median(letters.map((r) => { const b = box(r.contours), ref = REFERENCE[r.id]; return (b.y1 - b.y0) / Math.max(1, ref[1] - ref[0]); })) || 1);
  } else if (vbHeight > 0) k = 1000 / vbHeight;

  // 2. baseline: one shared move, so the letters keep their own heights relative to each other
  const scaled = (r: Raw) => ({ ...r, contours: r.contours.map((c) => c.map((s) => ({ p: { x: s.p.x * k, y: s.p.y * k }, hi: { x: s.hi.x * k, y: s.hi.y * k }, ho: { x: s.ho.x * k, y: s.ho.y * k } }))) });
  const sc = raws.map(scaled);
  const scaledLetters = sc.filter((r) => r.cell.kind === "letter" && REFERENCE[r.id]);
  const writing = median(scaledLetters.map((r) => { const b = box(r.contours), ref = REFERENCE[r.id]; return (b.y1 - b.y0) / Math.max(1, ref[1] - ref[0]); })) || 1;
  const dy = scaledLetters.length
    ? median(scaledLetters.map((r) => { const b = box(r.contours), ref = REFERENCE[r.id]; return (writing * (ref[0] + ref[1])) / 2 - (b.y0 + b.y1) / 2; }))
    : 0;

  for (const r of sc) {
    const b = box(r.contours);
    const isMark = r.cell.kind === "fili";
    const x0 = isMark ? (b.x0 + b.x1) / 2 : b.x0;
    const shift = isMark ? 0 : LSB;
    const contours = mapContours(r.contours, (p) => ({ x: r1(p.x - x0 + shift), y: r1(p.y + dy) }), 1);
    const glyph: Glyph = { id: r.id, cp: r.cell.cp, kind: r.cell.kind, contours, adv: isMark ? 0 : Math.round(b.x1 - b.x0 + 2 * LSB), source: "drawn" };
    const prev = items[r.id];
    items[r.id] = { id: r.id, file: names.get(r.id) ?? r.id, status: "ok", glyph: isMark ? snapMark(glyph) : glyph, strokes: prev?.strokes };
  }
}

/**
 * One SVG that is the printed template, page for page (A4). Every shape goes to the box it sits in.
 * Hide the template's own layer first, so only your artwork is in the file.
 */
export async function importSheet(file: SourceFile, layout: Layout, sheetId: number, outline: boolean): Promise<{ report: ImportReport; error?: string }> {
  const r = await readSvg(file.text);
  if (!r.ok) return { report: { items: {}, unmatched: [] }, error: r.reason };
  const { art } = r;
  const vb = art.viewBox;
  if (!vb) return { report: { items: {}, unmatched: [] }, error: "This SVG has no size. Export it from the artboard so it has a viewBox." };
  const aspect = vb.w / vb.h, want = layout.page.w / layout.page.h;
  if (Math.abs(aspect - want) / want > 0.03) {
    return { report: { items: {}, unmatched: [] }, error: "This does not look like an A4 sheet. Export the whole template page as one SVG." };
  }
  let contours = art.contours;
  if (art.strokes.length && outline) {
    try { contours = contours.concat(await outlineStrokes(art.strokes)); }
    catch (e) { return { report: { items: {}, unmatched: [] }, error: (e as Error).message }; }
  }
  const mmX = (x: number) => ((x - vb.x) / vb.w) * layout.page.w;
  const mmY = (y: number) => ((y - vb.y) / vb.h) * layout.page.h;
  const sheet = layout.sheets.find((s) => s.id === sheetId)!;
  const K = UNITS_PER_MM, baseY = layout.guides.baseY;
  const items: Record<string, ImportItem> = {};

  const centre = (c: Contour) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of c) { x0 = Math.min(x0, s.p.x); x1 = Math.max(x1, s.p.x); y0 = Math.min(y0, s.p.y); y1 = Math.max(y1, s.p.y); }
    return { x: mmX((x0 + x1) / 2), y: mmY((y0 + y1) / 2) };
  };
  for (const cell of sheet.cells) {
    const mine = contours.filter((c) => {
      const m = centre(c);
      return m.x >= cell.x && m.x <= cell.x + cell.w && m.y >= cell.y && m.y <= cell.y + cell.h - layout.guides.labelH;
    });
    if (!mine.length) continue;
    let minX = Infinity, maxX = -Infinity;
    for (const c of mine) for (const s of c) { minX = Math.min(minX, mmX(s.p.x) - cell.x); maxX = Math.max(maxX, mmX(s.p.x) - cell.x); }
    const isMark = cell.kind === "fili";
    const originMm = isMark ? layout.placeholder.x + layout.placeholder.w / 2 : minX;
    const shift = isMark ? 0 : LSB;
    const sx = layout.page.w / vb.w, sy = layout.page.h / vb.h;
    const out: Contour[] = mine.map((c) => c.map((s) => ({
      p: { x: r1((mmX(s.p.x) - cell.x - originMm) * K + shift), y: r1((baseY - (mmY(s.p.y) - cell.y)) * K) },
      hi: { x: r1(s.hi.x * sx * K), y: r1(-s.hi.y * sy * K) },
      ho: { x: r1(s.ho.x * sx * K), y: r1(-s.ho.y * sy * K) },
    })));
    const glyph: Glyph = { id: cell.id, cp: cell.cp, kind: cell.kind, contours: out, adv: isMark ? 0 : Math.round((maxX - minX) * K + 2 * LSB), source: "drawn" };
    items[cell.id] = { id: cell.id, file: file.name, status: "ok", glyph: isMark ? snapMark(glyph) : glyph };
  }
  return { report: { items, unmatched: [] } };
}

/** How the check grid describes a letter. */
export function summarise(report: ImportReport, layout: Layout) {
  const letters = layout.sheets[0].cells;
  const marks = layout.sheets[1].cells.filter((c) => c.kind === "fili");
  const extras = layout.sheets[1].cells.filter((c) => c.kind === "symbol");
  const count = (cells: LayoutCell[], s: ImportItem["status"]) => cells.filter((c) => report.items[c.id]?.status === s).length;
  return {
    letters: { total: letters.length, ok: count(letters, "ok"), fix: count(letters, "fix"), missing: letters.filter((c) => !report.items[c.id]).length },
    marks: { total: marks.length, ok: count(marks, "ok") },
    extras: { total: extras.length, ok: count(extras, "ok") },
    strokeFiles: Object.values(report.items).filter((i) => i.strokes).length,
  };
}
