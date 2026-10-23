"use client";

import GHOSTS_JSON from "@/lib/handwriting/ghosts.json";
import { X_HEIGHT, isLower } from "@/lib/handwriting/alphabet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inkBox } from "@/lib/handwriting/marks";
import { MarkerPanel } from "@/components/MarkerPanel";
import { ShapePanel } from "@/components/ShapePanel";
import {
  addContour, clone, deleteContour, deletePoint, dist, emptyGlyph, fitAdvance, insertPoint, isSmooth,
  makeCorner, makeSmooth, movePoint, moveHandle, nearestOnOutline, nudge, reverseContour, transformGlyph, type Sel,
} from "@/lib/handwriting/edit";
import { addStroke, cleanNib, DEFAULT_NIB, follow, hullsToD, strokeHulls, type Nib } from "@/lib/handwriting/marker";
import { layout } from "@/lib/handwriting/pipeline";
import { importOne } from "@/lib/handwriting/svgimport";
import { IDENTITY, applyShape, isIdentity, type Shape } from "@/lib/handwriting/shape";
import { contoursToD } from "@/lib/handwriting/svg";
import { UNITS_PER_MM, type Glyph, type LayoutCell, type Pt, type Seg } from "@/lib/handwriting/types";
import { revealOnOpen } from "@/lib/reveal";

type Tool = "select" | "move" | "pen" | "marker" | "erase";
const NIB_KEY = "thaanafont.nib";

const TOP = Math.round((layout.guides.baseY - layout.guides.topY) * UNITS_PER_MM);          // 494
const DESC = -Math.round((layout.guides.writeEnd - layout.guides.baseY) * UNITS_PER_MM);     // -304
const VB_W = 1400, VB_H = 940, VB_Y = -590;                                                 // font y from -350 to 590
const INK = "#264022", TEAL = "#264022", CORAL = "#FA7E00";

/** The eight handles round a selected letter: [-1 west, 1 east] and [-1 south, 1 north] in font space. */
const HANDLES = { nw: [-1, 1], n: [0, 1], ne: [1, 1], w: [-1, 0], e: [1, 0], sw: [-1, -1], s: [0, -1], se: [1, -1] } as const;
type Handle = keyof typeof HANDLES;
const HANDLE_CURSOR: Record<Handle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
type InkBox = { x0: number; y0: number; x1: number; y1: number };

type Drag =
  | { kind: "xf"; mode: "move" | Handle; base: Glyph; box: InkBox; pad: number; start: Pt; off: Pt; started: boolean; sx: number; sy: number }
  | { kind: "pt" | "hi" | "ho"; c: number; s: number; base: Glyph; started: boolean; sx: number; sy: number; off: Pt }
  | { kind: "pen" }
  | { kind: "marker" }
  | { kind: "pan"; sx: number; sy: number; cx: number; cy: number };

const ZOOM_MIN = 1, ZOOM_MAX = 12;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

const iconProps = { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function ToolButton({ label, on, disabled, onClick, children }: { label: string; on?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-[10px] border max-sm:h-auto max-sm:w-11 disabled:opacity-40 ${on ? "border-ink bg-ink text-white" : "border-[#BDCFC2] bg-white text-ink hover:bg-paper"}`}
    >
      {children}
    </button>
  );
}

/** A tool with its name under the icon, so a first-timer can tell what each one does. */
function LabelTool({ label, on, onClick, children }: { label: string; on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-w-0 flex-col items-center gap-0.5 rounded-[14px] border-[1.5px] px-1 pb-1.5 pt-2 text-[12px] font-bold sm:min-w-[68px] sm:px-2.5 sm:text-[13px] ${on ? "border-ink bg-ink text-white" : "border-[#BDCFC2] bg-white text-ink hover:bg-paper"}`}
    >
      {children}
      {label}
    </button>
  );
}


/** Tool icons: filled 24-unit artwork, so they take the button's text colour. */
const fillIcon = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true } as const;
const ICON = {
  select: [
    "M20.78,9.2,4.69,2.31A1.81,1.81,0,0,0,2.31,4.69l6.9,16.09a1.77,1.77,0,0,0,1.66,1.1H11a1.79,1.79,0,0,0,1.65-1.24l2-6,6-2a1.82,1.82,0,0,0,.14-3.4Zm-.61,2L13.78,13.3a.81.81,0,0,0-.48.48l-2.13,6.39a.28.28,0,0,1-.28.21.3.3,0,0,1-.31-.19h0L3.69,4.1a.3.3,0,0,1,.06-.34A.3.3,0,0,1,4,3.66a.31.31,0,0,1,.13,0l16.09,6.89a.29.29,0,0,1,.19.31A.28.28,0,0,1,20.17,11.17Z",
  ],
  brush: [
    "M21.75,7.4a4,4,0,0,0-7-2.77L8,12.43a4.39,4.39,0,0,0-2.57,1.62,4.25,4.25,0,0,0-.58,1.42,2.34,2.34,0,0,1-.4,1,2.62,2.62,0,0,1-1.55.84.75.75,0,0,0-.41,1.23,6.51,6.51,0,0,0,4.84,2.27,5.51,5.51,0,0,0,2.07-.39,6,6,0,0,0,3.19-3.31l7.83-6.78A4.06,4.06,0,0,0,21.75,7.4ZM8.78,19a4.55,4.55,0,0,1-4.36-.69,3.42,3.42,0,0,0,1.15-.94,3.54,3.54,0,0,0,.68-1.53,2.48,2.48,0,0,1,.37-.92,2.75,2.75,0,0,1,1.54-1L11,16.79A4.4,4.4,0,0,1,8.78,19Zm10.6-9.84L12,15.6,9.4,13.05l6.45-7.43a2.47,2.47,0,0,1,1.8-.87,2.5,2.5,0,0,1,2.6,2.6A2.47,2.47,0,0,1,19.38,9.15Z",
  ],
  pen: [
    "M21,7.46,16.54,3a2.76,2.76,0,0,0-3.89,0L10.52,5.17,5.45,8a3.84,3.84,0,0,0-1.94,2.87L2.26,20.91a.74.74,0,0,0,.74.84h.09l10.05-1.25A3.84,3.84,0,0,0,16,18.55l2.82-5.07L21,11.35A2.76,2.76,0,0,0,21,7.46ZM14.7,17.82A2.32,2.32,0,0,1,13,19L5.08,20l3.8-3.8a2.71,2.71,0,0,0,1.37.37,2.8,2.8,0,0,0,2-4.78,2.86,2.86,0,0,0-4,0,2.78,2.78,0,0,0-.82,2,2.71,2.71,0,0,0,.37,1.37L4,18.92,5,11A2.32,2.32,0,0,1,6.18,9.3l4.66-2.59,6.45,6.45ZM9,13.75a1.28,1.28,0,0,1,.38-.92,1.3,1.3,0,0,1,.92-.38,1.3,1.3,0,0,1,1.3,1.3,1.3,1.3,0,0,1-.38.92,1.34,1.34,0,0,1-1.84,0A1.26,1.26,0,0,1,9,13.75Zm11-3.46L18.22,12,12,5.78,13.71,4.1a1.25,1.25,0,0,1,1.77,0L19.9,8.52A1.25,1.25,0,0,1,19.9,10.29Z",
  ],
  reshape: [
    "M20,3.25H18A1.76,1.76,0,0,0,16.25,5V7a1.75,1.75,0,0,0,1.61,1.74,6.67,6.67,0,0,1-2.27,2.45.77.77,0,0,0-.22,1,.74.74,0,0,0,.63.34.78.78,0,0,0,.41-.12,8.24,8.24,0,0,0,3.08-3.7H20A1.76,1.76,0,0,0,21.75,7V5A1.76,1.76,0,0,0,20,3.25ZM20.25,7a.25.25,0,0,1-.25.25H18A.25.25,0,0,1,17.75,7V5A.25.25,0,0,1,18,4.75h2a.25.25,0,0,1,.25.25Z",
    "M10.2,12a6.65,6.65,0,0,1-4-3.26A1.76,1.76,0,0,0,7.75,7V5A1.76,1.76,0,0,0,6,3.25H4A1.76,1.76,0,0,0,2.25,5V7A1.76,1.76,0,0,0,4,8.75h.5a8.15,8.15,0,0,0,5.3,4.7l.2,0a.74.74,0,0,0,.72-.54A.76.76,0,0,0,10.2,12ZM3.75,7V5A.25.25,0,0,1,4,4.75H6A.25.25,0,0,1,6.25,5V7A.25.25,0,0,1,6,7.25H4A.25.25,0,0,1,3.75,7Z",
    "M18.76,15.3l-6.37-3.94a.74.74,0,0,0-.76,0,.75.75,0,0,0-.38.65l0,7.49a1.73,1.73,0,0,0,1.17,1.64,1.78,1.78,0,0,0,.59.1,1.72,1.72,0,0,0,1.35-.65l1.43-1.77,2.26-.29a1.75,1.75,0,0,0,.69-3.22ZM17.87,17l-2.55.33a.77.77,0,0,0-.48.28l-1.62,2a.23.23,0,0,1-.28.07.22.22,0,0,1-.17-.23l0-6.13L18,16.57a.23.23,0,0,1,.11.27A.21.21,0,0,1,17.87,17Z",
  ],
  eraser: [
    "M21,8.06,15.94,3a2.76,2.76,0,0,0-3.89,0L4.86,10.2A1.72,1.72,0,0,0,4.46,12L2.71,13.78a1.75,1.75,0,0,0,0,2.47l5,5A1.73,1.73,0,0,0,9,21.8a1.75,1.75,0,0,0,1.24-.51L12,19.54a1.72,1.72,0,0,0,1.83-.4L21,12a2.76,2.76,0,0,0,0-3.89ZM9.16,20.23a.21.21,0,0,1-.35,0l-5-5A.24.24,0,0,1,3.7,15a.26.26,0,0,1,.07-.18L5.4,13.21l5.39,5.39Zm10.78-9.34-7.2,7.19c-.13.13-.22.13-.35,0h0L5.92,11.61a.26.26,0,0,1-.07-.18.25.25,0,0,1,.07-.17l7.19-7.2A1.27,1.27,0,0,1,14,3.7a1.25,1.25,0,0,1,.88.36l5.06,5.06a1.25,1.25,0,0,1,.36.88A1.27,1.27,0,0,1,19.94,10.89Z",
  ],
} as const;
function ToolIcon({ name }: { name: keyof typeof ICON }) {
  return <svg {...fillIcon}>{ICON[name].map((d) => <path key={d} d={d} />)}</svg>;
}


/**
 * Edit one letter: move points and handles, add points, draw new shapes with the pen, delete.
 * `key` the component by letter so history starts fresh for each one.
 */
const GHOSTS = GHOSTS_JSON as Record<string, { d: string; adv: number }>;

export function GlyphEditor({
  cell, glyph, original, onChange, below,
}: {
  cell: LayoutCell;
  glyph: Glyph | null;
  original: Glyph | null;
  onChange: (g: Glyph | null) => void;
  below?: React.ReactNode;           // sits right under the drawing board, e.g. the previous and next letter buttons
}) {
  const [g, setG] = useState<Glyph>(() => (glyph ? clone(glyph) : emptyGlyph(cell.id, cell.cp, cell.kind)));
  const [past, setPast] = useState<Glyph[]>([]);
  const [future, setFuture] = useState<Glyph[]>([]);
  const [tool, setTool] = useState<Tool>(glyph ? "select" : "marker");
  const [zoomKey, setZoomKey] = useState("Ctrl");   // the shortcut named in the hint under the drawing
  const [sel, setSel] = useState<Sel>(null);
  const [pen, setPen] = useState<Seg[] | null>(null);
  const [nib, setNib] = useState<Nib>(DEFAULT_NIB);
  const [live, setLiveState] = useState<{ pts: Pt[]; press: number[] } | null>(null);   // the marker line being drawn right now
  const liveRef = useRef<{ pts: Pt[]; press: number[] } | null>(null);                  // the same line, always current, for the moment the pointer is let go
  const setLive = (v: { pts: Pt[]; press: number[] } | null) => { liveRef.current = v; setLiveState(v); };
  const [shape, setShape] = useState<Shape>({ ...IDENTITY });
  const [showPts, setShowPts] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [px, setPx] = useState(VB_W);       // width of the canvas in screen pixels
  const [cam, setCam] = useState({ z: 1, cx: 0, cy: VB_Y + VB_H / 2 });     // zoom and the middle of what is shown (svg space)
  const [ghostS, setGhostS] = useState(1);   // shrinks the grey hint when a joined letter and its mark would run past the top or bottom line
  const spaceDown = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const drag = useRef<Drag | null>(null);
  const isMark = cell.kind === "fili";
  // English letters: the top line is the cap line, and small letters get a line for their own height
  const guideLines: [number, string, boolean][] = cell.kind === "latin"
    ? [[TOP, "Cap line", false], ...(isLower(cell.label) ? [[X_HEIGHT, "x-height", false] as [number, string, boolean]] : []), [0, "Baseline", true], [DESC, "Descender", false]]
    : [[TOP, "Top", false], [TOP / 2, "Mid", false], [0, "Baseline", true], [DESC, "Descender", false]];
  const cx = useRef(isMark ? 0 : Math.max(glyph?.adv ?? 600, 360) / 2).current;
  const vw = VB_W / cam.z, vh = VB_H / cam.z;
  const vbx = (cam.z === 1 ? cx : cam.cx) - vw / 2, vby = (cam.z === 1 ? VB_Y + VB_H / 2 : cam.cy) - vh / 2;
  const u = vw / px;          // font units per screen pixel, so points and lines stay the same size on screen when zoomed

  useEffect(() => {
    if (cell.kind === "fili" || cell.kind === "latin") return;      // English letters have a ready-sized outline
    let stop = false;
    (async () => {
      try { await document.fonts.load("1000px AKRasmee", cell.label); } catch { /* the hint just stays full size */ }
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx || stop) return;
      ctx.font = "1000px AKRasmee, NotoThaana, sans-serif";
      const m = ctx.measureText(cell.label);
      const fit = Math.min(1, m.actualBoundingBoxAscent > 0 ? (TOP - 20) / m.actualBoundingBoxAscent : 1, m.actualBoundingBoxDescent > 0 ? (-DESC - 20) / m.actualBoundingBoxDescent : 1);
      setGhostS(Math.max(0.2, fit));
    })();
    return () => { stop = true; };
  }, [cell.label, cell.kind]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => setPx(Math.max(el.clientWidth, 1));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { try { const t = localStorage.getItem(NIB_KEY); if (t) setNib(cleanNib(JSON.parse(t))); } catch { /* the default nib is fine */ } }, []);
  const changeNib = (n: Nib) => { setNib(n); try { localStorage.setItem(NIB_KEY, JSON.stringify(n)); } catch { /* not kept, still works */ } };
  const liveD = useMemo(() => (live ? hullsToD(strokeHulls(live.pts, nib, live.press)) : ""), [live, nib]);

  const previewing = !isIdentity(shape);
  // while a slider is away from its middle, the canvas shows what Apply would do and the letter itself is not touched
  const view = useMemo(() => (previewing ? applyShape(g, shape) : g), [g, shape, previewing]);

  const finish = useCallback((next: Glyph) => {
    onChange(next.contours.length ? fitAdvance(next) : null);
  }, [onChange]);

  const commit = useCallback((next: Glyph, base?: Glyph) => {
    setPast((p) => [...p.slice(-99), base ?? g]);
    setFuture([]);
    const fitted = next.contours.length ? fitAdvance(next) : next;
    setG(fitted);
    setShape({ ...IDENTITY });
    finish(fitted);
  }, [g, finish]);

  const applyShapeNow = () => {
    if (!previewing) return;
    commit(applyShape(g, shape));
    setSel(null);
  };

  // Artwork from Illustrator (or any app that copies SVG code) can be pasted straight in, or an .svg file dropped on the canvas.
  const bringIn = useCallback(async (text: string) => {
    const r = await importOne(text, cell);
    if (!r.ok) {
      setNotice(r.reason === "no-svg"
        ? "That is not SVG. In Illustrator, turn on Preferences, Clipboard Handling, Include SVG Code, then copy again. Or save the artwork as an SVG file and drop it here."
        : r.reason);
      return;
    }
    commit(r.glyph);
    setSel(null); setPen(null); setTool("select");
    setNotice("Pasted. Use the sliders on the right to adjust size or weight. Undo brings back the old letter.");
  }, [cell, commit]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const text = dt.getData("image/svg+xml") || dt.getData("text/plain") || dt.getData("text/html");
      e.preventDefault();
      void bringIn(text);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [bringIn]);

  const onDrop = async (e: React.DragEvent) => {
    const f = Array.from(e.dataTransfer.files).find((x) => /\.svg$/i.test(x.name) || x.type === "image/svg+xml");
    if (!f) return;
    e.preventDefault();
    await bringIn(await f.text());
  };

  const undo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1)); setFuture([g, ...future]); setG(prev); setSel(null); setShape({ ...IDENTITY }); finish(prev);
  };
  const redo = () => {
    if (!future.length) return;
    const nxt = future[0];
    setFuture(future.slice(1)); setPast([...past, g]); setG(nxt); setSel(null); setShape({ ...IDENTITY }); finish(nxt);
  };

  // Ctrl or ⌘ Z works anywhere on the page, not only after clicking the drawing. Typing in a box keeps its own undo.
  const undoRef = useRef({ undo, redo });
  undoRef.current = { undo, redo };
  useEffect(() => {
    const onDoc = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && !(t instanceof HTMLInputElement && (t.type === "range" || t.type === "checkbox" || t.type === "radio"))) return;
      e.preventDefault();
      if (k === "y" || e.shiftKey) undoRef.current.redo(); else undoRef.current.undo();
    };
    document.addEventListener("keydown", onDoc);
    return () => document.removeEventListener("keydown", onDoc);
  }, []);
  useEffect(() => { if (/Mac|iPhone|iPad/.test(navigator.platform || "")) setZoomKey("⌘"); }, []);

  const toFont = (e: { clientX: number; clientY: number }): Pt => {
    const svg = svgRef.current!, grp = gRef.current!;
    const m = grp.getScreenCTM()!.inverse();
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const r = pt.matrixTransform(m);
    return { x: r.x, y: r.y };
  };

  // ---------------------------------------------------------------- zoom and pan
  const centreNow = () => ({ x: cam.z === 1 ? cx : cam.cx, y: cam.z === 1 ? VB_Y + VB_H / 2 : cam.cy });
  /** Zoom to `z`, keeping the spot under `at` (svg space) where it is on screen. */
  const zoomTo = (z: number, at?: { x: number; y: number }) => {
    const nz = clampZoom(z), c = centreNow();
    if (nz === cam.z) return;
    if (nz === 1) { setCam({ z: 1, cx: c.x, cy: c.y }); return; }
    const a = at ?? c, k = cam.z / nz;
    setCam({ z: nz, cx: a.x - (a.x - c.x) * k, cy: a.y - (a.y - c.y) * k });
  };
  const fitInk = () => {
    const b = inkBox(g);
    if (!b) { setCam({ z: 1, cx, cy: VB_Y + VB_H / 2 }); return; }
    const w = Math.max(b.x1 - b.x0, 60), h = Math.max(b.y1 - b.y0, 60);
    setCam({ z: clampZoom(Math.min(VB_W / (w * 1.5), VB_H / (h * 1.5))), cx: (b.x0 + b.x1) / 2, cy: -(b.y0 + b.y1) / 2 });
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    // pinch on a trackpad, or Ctrl or ⌘ with the wheel, zooms around the pointer. A plain wheel still scrolls the page.
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setCam((v) => {
        const z0 = v.z, nz = clampZoom(z0 * Math.exp(-e.deltaY * 0.01));
        if (nz === z0) return v;
        const w0 = VB_W / z0, h0 = VB_H / z0;
        const c = { x: z0 === 1 ? cx : v.cx, y: z0 === 1 ? VB_Y + VB_H / 2 : v.cy };
        const at = { x: c.x - w0 / 2 + ((e.clientX - r.left) / r.width) * w0, y: c.y - h0 / 2 + ((e.clientY - r.top) / r.height) * h0 };
        const k = z0 / nz;
        return { z: nz, cx: at.x - (at.x - c.x) * k, cy: at.y - (at.y - c.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [cx]);

  const closePen = () => {
    if (pen && pen.length >= 3) {
      const next = addContour(g, pen);
      commit(next);
      setSel(null);
    }
    setPen(null);
  };

  // ---------------------------------------------------------------- pointer handling
  const onSvgDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      e.preventDefault();
      const c = centreNow();
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: c.x, cy: c.y };
      svgRef.current!.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0 || previewing) return;
    const pos = toFont(e);
    if (tool === "marker") {
      setSel(null);
      setLive({ pts: [pos], press: [pressureOf(e)] });
      drag.current = { kind: "marker" };
      svgRef.current!.setPointerCapture(e.pointerId);
    } else if (tool === "pen") {
      if (pen && pen.length >= 3 && dist(pos, pen[0].p) < 14 * u) { closePen(); return; }
      setPen([...(pen ?? []), { p: pos, hi: { x: 0, y: 0 }, ho: { x: 0, y: 0 } }]);
      drag.current = { kind: "pen" };
      svgRef.current!.setPointerCapture(e.pointerId);
    } else if (tool === "select") {
      setSel(null);
      const b = g.contours.length ? inkBox(g) : null, m = 10 * u;
      if (b && pos.x >= b.x0 - m && pos.x <= b.x1 + m && pos.y >= b.y0 - m && pos.y <= b.y1 + m) {
        drag.current = { kind: "xf", mode: "move", base: g, box: b, pad: m, start: pos, off: { x: 0, y: 0 }, started: false, sx: e.clientX, sy: e.clientY };
        svgRef.current!.setPointerCapture(e.pointerId);
      } else if (cam.z > 1) {
        const c = centreNow();
        drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: c.x, cy: c.y };
        svgRef.current!.setPointerCapture(e.pointerId);
      }
    } else if (tool === "move") {
      setSel(null);
      if (cam.z > 1) {            // when zoomed in, dragging empty space moves the view
        const c = centreNow();
        drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: c.x, cy: c.y };
        svgRef.current!.setPointerCapture(e.pointerId);
      }
    }
  };

  /** A pen or finger that can tell how hard it presses widens the line; a mouse does not. */
  const pressureOf = (e: React.PointerEvent) => (e.pointerType === "pen" && e.pressure > 0 ? Math.min(1.6, Math.max(0.3, e.pressure * 1.6)) : 1);

  const onNodeDown = (e: React.PointerEvent, kind: "pt" | "hi" | "ho", c: number, s: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (previewing) return;
    if (tool === "erase") {
      commit(deletePoint(g, c, s));
      setSel(null);
      return;
    }
    setSel({ c, s });
    // remember where inside the point the pointer grabbed it, so grabbing off-centre never makes it jump
    const sg = g.contours[c][s], at = toFont(e);
    const own = kind === "pt" ? sg.p : { x: sg.p.x + sg[kind].x, y: sg.p.y + sg[kind].y };
    drag.current = { kind, c, s, base: g, started: false, sx: e.clientX, sy: e.clientY, off: { x: at.x - own.x, y: at.y - own.y } };
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  const onHandleDown = (e: React.PointerEvent, h: Handle, b: InkBox, pad: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (previewing) return;
    const [hx, hy] = HANDLES[h];
    const at = toFont(e);
    const own = { x: (hx === 1 ? b.x1 : hx === -1 ? b.x0 : (b.x0 + b.x1) / 2) + hx * pad, y: (hy === 1 ? b.y1 : hy === -1 ? b.y0 : (b.y0 + b.y1) / 2) + hy * pad };
    drag.current = { kind: "xf", mode: h, base: g, box: b, pad, start: at, off: { x: at.x - own.x, y: at.y - own.y }, started: false, sx: e.clientX, sy: e.clientY };
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (e.buttons === 0 && d.kind !== "pen") { onUp(); return; }       // the button was let go somewhere we did not see
    if (d.kind === "pan") {
      const k = vw / px;
      setCam((v) => ({ ...v, cx: d.cx - (e.clientX - d.sx) * k, cy: d.cy - (e.clientY - d.sy) * k }));
      return;
    }
    if (d.kind === "marker") {
      const to = toFont(e), pr = pressureOf(e);
      const v = liveRef.current;
      const q = v ? follow(v.pts[v.pts.length - 1], to, nib.smooth, 1.5 * u) : null;
      if (v && q) setLive({ pts: [...v.pts, q], press: [...v.press, pr] });
      return;
    }
    if (d.kind === "xf") {
      if (!d.started) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;      // a tap, not a drag
        d.started = true;
        setPast((p) => [...p.slice(-99), d.base]);
        setFuture([]);
      }
      const at = toFont(e);
      if (d.mode === "move") { setG(transformGlyph(d.base, { ax: 0, ay: 0, sx: 1, sy: 1, dx: at.x - d.start.x, dy: at.y - d.start.y })); return; }
      const [hx, hy] = HANDLES[d.mode], b = d.box;
      const ax = hx === 1 ? b.x0 : hx === -1 ? b.x1 : (b.x0 + b.x1) / 2, ay = hy === 1 ? b.y0 : hy === -1 ? b.y1 : (b.y0 + b.y1) / 2;
      const tx = at.x - d.off.x - hx * d.pad, ty = at.y - d.off.y - hy * d.pad;       // where the grabbed side of the letter itself should be
      const ow = (hx === 1 ? b.x1 : b.x0) - ax, oh = (hy === 1 ? b.y1 : b.y0) - ay;
      let sx = hx === 0 || Math.abs(ow) < 1 ? 1 : (tx - ax) / ow, sy = hy === 0 || Math.abs(oh) < 1 ? 1 : (ty - ay) / oh;
      if (hx !== 0 && hy !== 0 && !e.shiftKey) { const k = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy; sx = k; sy = k; }     // a corner keeps the shape, Shift frees it
      setG(transformGlyph(d.base, { ax, ay, sx: Math.max(0.1, sx), sy: Math.max(0.1, sy), dx: 0, dy: 0 }));
      return;
    }
    const raw = toFont(e);
    const pos = d.kind === "pen" ? raw : { x: raw.x - d.off.x, y: raw.y - d.off.y };
    if (d.kind === "pen") {
      setPen((prev) => {
        if (!prev) return prev;
        const last = prev[prev.length - 1];
        const ho = { x: Math.round((pos.x - last.p.x) * 10) / 10, y: Math.round((pos.y - last.p.y) * 10) / 10 };
        return [...prev.slice(0, -1), { ...last, ho, hi: { x: -ho.x, y: -ho.y } }];
      });
      return;
    }
    if (!d.started) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;      // a click, not a drag
      d.started = true;
      setPast((p) => [...p.slice(-99), d.base]);
      setFuture([]);
    }
    setG(d.kind === "pt" ? movePoint(d.base, d.c, d.s, pos) : moveHandle(d.base, d.c, d.s, d.kind, pos, !e.altKey));
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "marker") {
      const v = liveRef.current;
      setLive(null);
      if (v) {
        const next = addStroke(g, strokeHulls(v.pts, nib, v.press), nib, v.pts);
        if (next !== g) commit(next);
      }
      return;
    }
    if (d && d.kind !== "pen" && d.kind !== "pan" && d.started) {
      const fitted = fitAdvance(g);
      setG(fitted);
      finish(fitted);
    }
  };

  const onDouble = (e: React.MouseEvent) => {
    if (tool !== "move" || previewing) return;
    const n = nearestOnOutline(g.contours, toFont(e));
    if (n && n.d < 14 * u) {
      commit(insertPoint(g, n.c, n.s, n.t));
      setSel({ c: n.c, s: n.s + 1 });
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === " " && !pen) { spaceDown.current = true; e.preventDefault(); return; }
    if (!mod && (e.key === "+" || e.key === "=")) { e.preventDefault(); zoomTo(cam.z * 1.5); return; }
    if (!mod && (e.key === "-" || e.key === "_")) { e.preventDefault(); zoomTo(cam.z / 1.5); return; }
    if (!mod && e.key === "0") { e.preventDefault(); zoomTo(1); return; }
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (e.key === "Enter" && pen) { e.preventDefault(); closePen(); return; }
    if (e.key === "Escape") { setPen(null); setSel(null); setLive(null); drag.current = null; return; }
    if (tool === "select" && g.contours.length && !previewing) {
      const st = e.shiftKey ? 20 : 4;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] };
      if (mv[e.key]) { e.preventDefault(); commit(transformGlyph(g, { ax: 0, ay: 0, sx: 1, sy: 1, dx: mv[e.key][0], dy: mv[e.key][1] })); return; }
    }
    if (!sel) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); commit(deletePoint(g, sel.c, sel.s)); setSel(null); return; }
    const step = e.shiftKey ? 20 : 4;
    const arrow: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (arrow[e.key]) { e.preventDefault(); commit(nudge(g, sel.c, sel.s, ...arrow[e.key])); }
  };

  const selSeg = sel ? g.contours[sel.c]?.[sel.s] : undefined;
  const hasShape = g.contours.length > 0;
  const penD = (() => {
    if (!pen?.length) return "";
    let d = `M${pen[0].p.x} ${pen[0].p.y}`;
    for (let i = 1; i < pen.length; i++) {
      const a = pen[i - 1], b = pen[i];
      d += `C${a.p.x + a.ho.x} ${a.p.y + a.ho.y} ${b.p.x + b.hi.x} ${b.p.y + b.hi.y} ${b.p.x} ${b.p.y}`;
    }
    return d;
  })();

  const hint = previewing
    ? "Previewing. Press Apply to keep it."
    : tool === "marker"
    ? "Drag to draw with the brush."
    : tool === "pen"
    ? pen?.length
      ? pen.length < 3 ? "Keep clicking to add dots." : "Click the first dot or press Enter to close."
      : "Click to place dots. Drag to curve."
    : tool === "select"
    ? (hasShape ? "Drag to move. Drag a corner to resize." : "Nothing drawn yet. Use Brush or Pen, or paste with Ctrl or ⌘ V.")
    : tool === "erase"
      ? "Click a dot or a shape to remove it."
      : hasShape
        ? "Drag any dot to fix the shape."
        : "Nothing drawn yet. Use Brush or Pen, or paste with Ctrl or ⌘ V.";

  const node = 4 * u, hit = 9 * u, line = 1.4 * u;
  const selPad = 10 * u;
  const selBox = tool === "select" && hasShape && !previewing ? inkBox(g) : null;

  return (
    <div className="flex flex-col gap-3" onKeyDown={onKey} onKeyUp={(e) => { if (e.key === " ") spaceDown.current = false; }} tabIndex={0} role="group" aria-label="Letter editor" data-testid="editor">
      <div className="grid grid-cols-[1fr_auto] gap-x-1.5 gap-y-3 [grid-template-areas:'tools_tools'_'hint_undo'] sm:gap-x-2 sm:[grid-template-areas:'tools_undo'_'hint_hint']">
        <div className="grid grid-cols-5 gap-1.5 [grid-area:tools] sm:flex sm:flex-wrap sm:items-stretch sm:gap-2" role="toolbar" aria-label="Tools">
          <LabelTool label="Select" on={tool === "select"} onClick={() => { setTool("select"); setSel(null); setPen(null); setLive(null); }}>
            <ToolIcon name="select" />
          </LabelTool>
          <LabelTool label="Brush" on={tool === "marker"} onClick={() => { setTool("marker"); setSel(null); setPen(null); }}>
            <ToolIcon name="brush" />
          </LabelTool>
          <LabelTool label="Pen" on={tool === "pen"} onClick={() => { setTool("pen"); setSel(null); setLive(null); }}>
            <ToolIcon name="pen" />
          </LabelTool>
          <LabelTool label="Edit" on={tool === "move"} onClick={() => { setTool("move"); setPen(null); setLive(null); }}>
            <ToolIcon name="reshape" />
          </LabelTool>
          <LabelTool label="Erase" on={tool === "erase"} onClick={() => { setTool("erase"); setPen(null); setSel(null); setLive(null); }}>
            <ToolIcon name="eraser" />
          </LabelTool>
        </div>
        <div className="flex items-stretch gap-1.5 [grid-area:undo] sm:items-center sm:gap-2" role="group" aria-label="History">
          <ToolButton label="Undo" disabled={!past.length} onClick={undo}>
            <svg {...iconProps}><path d="M7 5L3 9l4 4M3 9h9a4 4 0 010 8h-2" /></svg>
          </ToolButton>
          <ToolButton label="Redo" disabled={!future.length} onClick={redo}>
            <svg {...iconProps}><path d="M13 5l4 4-4 4M17 9H8a4 4 0 000 8h2" /></svg>
          </ToolButton>
        </div>
        <p className="flex min-h-[60px] items-center rounded-[14px] bg-lilac-soft px-3.5 py-2.5 text-sm [grid-area:hint] sm:min-h-[40px]" aria-live="polite" data-testid="editor-hint">{hint}</p>
      </div>

      <div className="flex flex-wrap items-start gap-4">
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3 xl:sticky xl:top-24 xl:self-start">
      <div className="relative select-none overflow-hidden rounded-[14px] bg-[#F3F9F5]">
        <svg
          ref={svgRef}
          viewBox={`${vbx} ${vby} ${vw} ${vh}`}
          className="block h-auto w-full touch-none select-none"
          style={{ cursor: tool === "pen" || tool === "marker" ? "crosshair" : tool === "erase" ? "not-allowed" : cam.z > 1 ? "grab" : "default" }}
          data-testid="editor-svg"
          data-vb={`${vbx} ${vby} ${vw} ${vh}`}
          data-zoom={cam.z}
          onPointerDown={onSvgDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onLostPointerCapture={onUp}
          onDoubleClick={onDouble}
          onMouseDown={(e) => { if (e.detail > 1) e.preventDefault(); }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <g ref={gRef} transform="scale(1,-1)">
            {/* guides */}
            {guideLines.map(([y, name, strong]) => (
              <g key={name as string}>
                <line x1={vbx} x2={vbx + vw} y1={y as number} y2={y as number} stroke={strong ? TEAL : "#BDCFC2"} strokeWidth={(strong ? 1.6 : 1) * u} strokeDasharray={strong ? undefined : `${6 * u} ${5 * u}`} />
                <text transform="scale(1,-1)" x={vbx + 12 * u} y={-(y as number) - 6 * u} fontSize={12 * u} fill={strong ? TEAL : "#5D797B"} fontWeight={strong ? 700 : 400} pointerEvents="none" style={{ userSelect: "none", WebkitUserSelect: "none" }}>{name as string}</text>
              </g>
            ))}
            {!isMark && [0, g.adv].map((x) => (
              <line key={x} x1={x} x2={x} y1={DESC} y2={TOP} stroke="#BDCFC2" strokeWidth={1 * u} strokeDasharray={`${3 * u} ${4 * u}`} />
            ))}
            {isMark && <line x1={0} x2={0} y1={DESC} y2={TOP} stroke="#BDCFC2" strokeWidth={1 * u} strokeDasharray={`${3 * u} ${4 * u}`} />}

            {/* the starter letter, only as a hint for a letter that has no drawing yet */}
            {!hasShape && !pen && !live && (
              // an outline, not text: Safari cuts big text off at a straight edge
              GHOSTS[cell.label] ? (
                <path aria-hidden d={GHOSTS[cell.label].d} transform={`translate(${cx - (GHOSTS[cell.label].adv * ghostS) / 2} 0) scale(${ghostS})`} fill={INK} opacity={0.1} />
              ) : (
                // joined letters you made yourself have no stored outline: pad the text so nothing hangs past its box
                <g transform={`translate(${cx} 0) scale(${ghostS * 10} ${-ghostS * 10})`} aria-hidden>
                  <text x={0} y={0} textAnchor="middle" fontSize={100} fontFamily="AKRasmee, NotoThaana, sans-serif" textRendering="geometricPrecision" fill={INK} opacity={0.1}>
                    {"\u2003" + cell.label + "\u2003"}
                  </text>
                </g>
              )
            )}

            {/* outlines */}
            {/* one fill for the whole letter, so a hole (a dry streak, a chip, the counter of a ring) cuts through like it does in the font */}
            <path d={contoursToD(view.contours)} fill={INK} fillOpacity={previewing ? 0.7 : 1} fillRule="nonzero" pointerEvents="none" data-testid="glyph-fill" />
            {view.contours.map((ct, c) => (
              <path
                key={c}
                d={contoursToD([ct])}
                fill="transparent"
                stroke={sel?.c === c ? TEAL : "none"}
                strokeWidth={2 * u}
                pointerEvents={tool === "erase" ? "visiblePainted" : "none"}
                style={{ cursor: tool === "erase" ? "pointer" : undefined }}
                data-contour={c}
                onPointerDown={tool === "erase" ? (e) => { e.stopPropagation(); commit(deleteContour(g, c)); setSel(null); } : undefined}
              />
            ))}

            {/* points */}
            {tool !== "pen" && tool !== "marker" && tool !== "select" && showPts && !previewing && g.contours.map((ct, c) => ct.map((sg, s) => {
              const on = sel?.c === c && sel.s === s;
              return (
                <g key={`${c}-${s}`}>
                  <rect x={sg.p.x - node} y={sg.p.y - node} width={node * 2} height={node * 2} fill={on ? CORAL : "#fff"} stroke={on ? CORAL : TEAL} strokeWidth={line * 1.3} pointerEvents="none" />
                  <circle cx={sg.p.x} cy={sg.p.y} r={hit} fill="transparent" data-node={`${c}-${s}`} style={{ cursor: tool === "erase" ? "pointer" : "grab" }} onPointerDown={(e) => onNodeDown(e, "pt", c, s)} />
                </g>
              );
            }))}

            {/* handles of the selected point */}
            {tool !== "pen" && tool !== "marker" && tool !== "select" && showPts && !previewing && sel && selSeg && (["hi", "ho"] as const).map((k) => {
              const h = selSeg[k];
              if (!h.x && !h.y) return null;
              const pos = { x: selSeg.p.x + h.x, y: selSeg.p.y + h.y };
              return (
                <g key={k}>
                  <line x1={selSeg.p.x} y1={selSeg.p.y} x2={pos.x} y2={pos.y} stroke={CORAL} strokeWidth={line} />
                  <circle cx={pos.x} cy={pos.y} r={node} fill="#fff" stroke={CORAL} strokeWidth={line * 1.3} />
                  <circle cx={pos.x} cy={pos.y} r={hit} fill="transparent" data-handle={k} style={{ cursor: "grab" }} onPointerDown={(e) => onNodeDown(e, k, sel.c, sel.s)} />
                </g>
              );
            })}

            {/* the box round the letter, with eight handles, for moving and resizing it */}
            {selBox && (
              <g data-testid="select-box">
                <rect x={selBox.x0 - selPad} y={selBox.y0 - selPad} width={selBox.x1 - selBox.x0 + 2 * selPad} height={selBox.y1 - selBox.y0 + 2 * selPad}
                  fill="transparent" stroke={CORAL} strokeWidth={1.6 * u} strokeDasharray={`${6 * u} ${4 * u}`} style={{ cursor: "move" }} data-testid="select-move" />
                {(Object.keys(HANDLES) as Handle[]).map((h) => {
                  const [hx, hy] = HANDLES[h];
                  const x = (hx === 1 ? selBox.x1 : hx === -1 ? selBox.x0 : (selBox.x0 + selBox.x1) / 2) + hx * selPad;
                  const y = (hy === 1 ? selBox.y1 : hy === -1 ? selBox.y0 : (selBox.y0 + selBox.y1) / 2) + hy * selPad;
                  const reach = Math.min(20 * u, Math.max(9 * u, Math.min(selBox.x1 - selBox.x0, selBox.y1 - selBox.y0) * 0.28));
                  return (
                    <g key={h}>
                      <rect x={x - 5.5 * u} y={y - 5.5 * u} width={11 * u} height={11 * u} rx={2 * u} fill="#fff" stroke={CORAL} strokeWidth={1.8 * u} pointerEvents="none" />
                      <circle cx={x} cy={y} r={reach} fill="transparent" data-testid={`select-handle-${h}`} style={{ cursor: HANDLE_CURSOR[h] }} onPointerDown={(e) => onHandleDown(e, h, selBox, selPad)} />
                    </g>
                  );
                })}
              </g>
            )}

            {/* the line being drawn with the marker */}
            {live && <path d={liveD} fill={CORAL} fillOpacity={0.85} fillRule="nonzero" pointerEvents="none" data-testid="marker-live" />}

            {/* the shape being drawn with the pen */}
            {pen && (
              <g>
                <path d={penD} fill="none" stroke={CORAL} strokeWidth={2.5 * u} />
                {pen.map((sg, i) => (
                  <g key={i}>
                    {(sg.ho.x || sg.ho.y) && (
                      <>
                        <line x1={sg.p.x + sg.hi.x} y1={sg.p.y + sg.hi.y} x2={sg.p.x + sg.ho.x} y2={sg.p.y + sg.ho.y} stroke={CORAL} strokeWidth={line} />
                        <circle cx={sg.p.x + sg.ho.x} cy={sg.p.y + sg.ho.y} r={node * 0.8} fill="#fff" stroke={CORAL} strokeWidth={line} />
                      </>
                    )}
                    <rect x={sg.p.x - node} y={sg.p.y - node} width={node * 2} height={node * 2} fill={i === 0 ? CORAL : "#fff"} stroke={CORAL} strokeWidth={line * 1.3} />
                  </g>
                ))}
              </g>
            )}
          </g>
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-0.5 rounded-xl border border-line bg-white p-[3px]" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" disabled={cam.z <= ZOOM_MIN} onClick={() => zoomTo(cam.z / 1.5)} className="h-8 w-8 rounded-lg text-lg font-bold hover:bg-paper disabled:opacity-40">−</button>
          <button type="button" aria-label="Back to the whole view" onClick={() => zoomTo(1)} data-testid="zoom-level" className="h-8 min-w-[48px] rounded-lg px-1.5 text-[13px] font-bold tabular-nums hover:bg-paper">{Math.round(cam.z * 100)}%</button>
          <button type="button" aria-label="Zoom in" disabled={cam.z >= ZOOM_MAX} onClick={() => zoomTo(cam.z * 1.5)} className="h-8 w-8 rounded-lg text-lg font-bold hover:bg-paper disabled:opacity-40">+</button>
          <button type="button" aria-label="Zoom to the letter" onClick={fitInk} disabled={!hasShape} className="ml-0.5 h-8 rounded-lg border-l border-line px-2.5 text-[13px] font-bold text-muted hover:bg-paper disabled:opacity-40"><span className="sm:hidden">Fit</span><span className="hidden sm:inline">Fit letter</span></button>
        </div>
        <button
          type="button"
          aria-label={original ? "Back to my drawing" : "Clear this letter"}
          data-testid="clear-letter"
          disabled={!original && !hasShape}
          onClick={() => {
            const base = original ? clone(original) : emptyGlyph(cell.id, cell.cp, cell.kind);
            commit(base);
            setSel(null); setPen(null);
          }}
          className="flex h-10 items-center gap-1.5 rounded-xl border-[1.5px] border-[#F2C7A0] bg-coral-soft px-3.5 text-[13.5px] font-bold text-[#8A3B00] hover:bg-[#FFDDBB] disabled:opacity-40"
        >
          <svg {...iconProps} width={16} height={16}><path d="M3.5 5.5h13M7.5 5.5v-2h5v2M5 5.5l.8 11h8.4l.8-11" /></svg>
          <span className="sm:hidden">{original ? "My drawing" : "Clear"}</span>
          <span className="hidden sm:inline">{original ? "Back to my drawing" : "Clear this letter"}</span>
        </button>
        <p className="hidden basis-full text-xs text-muted [@media(pointer:fine)]:block" data-testid="zoom-hint">{zoomKey} + scroll to zoom. Space + drag to move.</p>
      </div>
      {below}
      {notice && (
        <p role="status" data-testid="paste-notice" className="flex items-start justify-between gap-3 rounded-xl bg-sand px-3.5 py-2.5 text-[13px] leading-snug">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="font-bold">×</button>
        </p>
      )}
      </div>
      <aside aria-label="Adjust" className="flex w-full flex-col gap-3.5 rounded-2xl border border-line bg-white p-3.5 xl:w-[320px] xl:shrink-0">
        <section aria-labelledby="tool-title" className="flex flex-col gap-3">
          <h3 id="tool-title" className="text-xs font-bold uppercase tracking-wider text-muted">{tool === "marker" ? "Brush" : tool === "move" ? "Selected dot" : tool === "pen" ? "Pen" : tool === "erase" ? "Erase" : "Select"}</h3>
          {/* every tool's panel sits in the same cell, so the box keeps one height when the tool changes */}
        <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
          <div className={tool === "marker" ? "" : "invisible"} aria-hidden={tool !== "marker"}><MarkerPanel nib={nib} onNib={changeNib} /></div>
          <div className={tool === "move" ? "" : "invisible"} aria-hidden={tool !== "move"}>
            <div className="flex flex-col gap-3" data-testid="dot-panel">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={!selSeg || isSmooth(selSeg)} onClick={() => sel && commit(makeSmooth(g, sel.c, sel.s))} className="min-h-[44px] rounded-xl border border-[#BDCFC2] bg-white px-2 text-sm font-bold hover:bg-paper disabled:opacity-40">Curved</button>
                <button type="button" disabled={!selSeg || (!selSeg.hi.x && !selSeg.hi.y && !selSeg.ho.x && !selSeg.ho.y)} onClick={() => sel && commit(makeCorner(g, sel.c, sel.s))} className="min-h-[44px] rounded-xl border border-[#BDCFC2] bg-white px-2 text-sm font-bold hover:bg-paper disabled:opacity-40">Sharp corner</button>
              </div>
              <details className="border-t border-line pt-3" onToggle={revealOnOpen}>
                <summary className="cursor-pointer text-sm font-bold">More</summary>
                <div className="mt-3 flex flex-col gap-3">
                  <button type="button" disabled={!sel} onClick={() => sel && commit(reverseContour(g, sel.c))} title="Turns a filled shape into a hole, or a hole into a filled shape" className="min-h-[44px] rounded-xl border border-[#BDCFC2] bg-white px-2 text-sm font-bold hover:bg-paper disabled:opacity-40">Fill ↔ hole</button>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={showPts} onChange={(e) => setShowPts(e.target.checked)} className="h-[18px] w-[18px] accent-teal" />
                    Show dots
                  </label>
                </div>
              </details>
            </div>
          </div>
          <div className={tool === "pen" || tool === "erase" || tool === "select" ? "" : "invisible"} aria-hidden={tool !== "pen" && tool !== "erase" && tool !== "select"}>
            <p className="rounded-xl bg-[#F3F9F5] px-3 py-2.5 text-sm text-muted">{tool === "select" ? "For exact size, width, slant and position, use Reshape below." : "Nothing to set for this tool."}</p>
          </div>
        </div>
        </section>
        <section aria-labelledby="reshape-title" className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="reshape-title" className="text-xs font-bold uppercase tracking-wider text-muted">Reshape this letter</h3>
            <span className="text-xs text-muted max-sm:hidden">previews until you apply</span>
          </div>
          <ShapePanel shape={shape} onShape={setShape} onApply={applyShapeNow} disabled={!hasShape} />
        </section>
      </aside>
      </div>
    </div>
  );
}
