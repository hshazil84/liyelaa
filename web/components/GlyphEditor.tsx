"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inkBox } from "@/lib/handwriting/marks";
import { ShapePanel } from "@/components/ShapePanel";
import {
  addContour, clone, deleteContour, deletePoint, dist, emptyGlyph, fitAdvance, insertPoint, isSmooth,
  makeCorner, makeSmooth, movePoint, moveHandle, nearestOnOutline, nudge, reverseContour, type Sel,
} from "@/lib/handwriting/edit";
import { layout } from "@/lib/handwriting/pipeline";
import { importOne } from "@/lib/handwriting/svgimport";
import { IDENTITY, applyShape, isIdentity, type Shape } from "@/lib/handwriting/shape";
import { contoursToD } from "@/lib/handwriting/svg";
import { UNITS_PER_MM, type Glyph, type LayoutCell, type Pt, type Seg } from "@/lib/handwriting/types";

type Tool = "move" | "pen" | "erase";

const TOP = Math.round((layout.guides.baseY - layout.guides.topY) * UNITS_PER_MM);          // 494
const DESC = -Math.round((layout.guides.writeEnd - layout.guides.baseY) * UNITS_PER_MM);     // -304
const VB_W = 1400, VB_H = 940, VB_Y = -590;                                                 // font y from -350 to 590
const INK = "#264022", TEAL = "#264022", CORAL = "#FA7E00";

type Drag =
  | { kind: "pt" | "hi" | "ho"; c: number; s: number; base: Glyph; started: boolean; sx: number; sy: number; off: Pt }
  | { kind: "pen" }
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
      className={`flex h-10 w-10 items-center justify-center rounded-[10px] border disabled:opacity-40 ${on ? "border-ink bg-ink text-white" : "border-[#BDCFC2] bg-white text-ink hover:bg-paper"}`}
    >
      {children}
    </button>
  );
}

/**
 * Edit one letter: move points and handles, add points, draw new shapes with the pen, delete.
 * `key` the component by letter so history starts fresh for each one.
 */
export function GlyphEditor({
  cell, glyph, original, onChange,
}: {
  cell: LayoutCell;
  glyph: Glyph | null;
  original: Glyph | null;
  onChange: (g: Glyph | null) => void;
}) {
  const [g, setG] = useState<Glyph>(() => (glyph ? clone(glyph) : emptyGlyph(cell.id, cell.cp, cell.kind)));
  const [past, setPast] = useState<Glyph[]>([]);
  const [future, setFuture] = useState<Glyph[]>([]);
  const [tool, setTool] = useState<Tool>(glyph ? "move" : "pen");
  const [sel, setSel] = useState<Sel>(null);
  const [pen, setPen] = useState<Seg[] | null>(null);
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
  const cx = useRef(isMark ? 0 : Math.max(glyph?.adv ?? 600, 360) / 2).current;
  const vw = VB_W / cam.z, vh = VB_H / cam.z;
  const vbx = (cam.z === 1 ? cx : cam.cx) - vw / 2, vby = (cam.z === 1 ? VB_Y + VB_H / 2 : cam.cy) - vh / 2;
  const u = vw / px;          // font units per screen pixel, so points and lines stay the same size on screen when zoomed

  useEffect(() => {
    if (cell.kind === "fili") return;
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
    setSel(null); setPen(null); setTool("move");
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
    if (tool === "pen") {
      if (pen && pen.length >= 3 && dist(pos, pen[0].p) < 14 * u) { closePen(); return; }
      setPen([...(pen ?? []), { p: pos, hi: { x: 0, y: 0 }, ho: { x: 0, y: 0 } }]);
      drag.current = { kind: "pen" };
      svgRef.current!.setPointerCapture(e.pointerId);
    } else if (tool === "move") {
      setSel(null);
      if (cam.z > 1) {            // when zoomed in, dragging empty space moves the view
        const c = centreNow();
        drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: c.x, cy: c.y };
        svgRef.current!.setPointerCapture(e.pointerId);
      }
    }
  };

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

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (e.buttons === 0 && d.kind !== "pen") { onUp(); return; }       // the button was let go somewhere we did not see
    if (d.kind === "pan") {
      const k = vw / px;
      setCam((v) => ({ ...v, cx: d.cx - (e.clientX - d.sx) * k, cy: d.cy - (e.clientY - d.sy) * k }));
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
    if (e.key === "Escape") { setPen(null); setSel(null); return; }
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

  const node = 4 * u, hit = 9 * u, line = 1.4 * u;

  return (
    <div className="flex flex-col gap-3" onKeyDown={onKey} onKeyUp={(e) => { if (e.key === " ") spaceDown.current = false; }} tabIndex={0} role="group" aria-label="Letter editor" data-testid="editor">
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolButton label="Pen" on={tool === "pen"} onClick={() => { setTool("pen"); setSel(null); }}>
          <svg {...iconProps}><path d="M3 17l1-4 9-9 3 3-9 9-4 1zM12 5l3 3" /></svg>
        </ToolButton>
        <ToolButton label="Move points" on={tool === "move"} onClick={() => { setTool("move"); setPen(null); }}>
          <svg {...iconProps}><path d="M5 3l10 6-4 1.5L9 15 5 3z" /></svg>
        </ToolButton>
        <ToolButton label="Eraser" on={tool === "erase"} onClick={() => { setTool("erase"); setPen(null); setSel(null); }}>
          <svg {...iconProps}><path d="M8 16l-4-4 8-8 5 5-6 7H8zM7 8l5 5" /></svg>
        </ToolButton>
        <span className="mx-1 h-6 w-px bg-line" />
        <ToolButton label="Undo" disabled={!past.length} onClick={undo}>
          <svg {...iconProps}><path d="M7 5L3 9l4 4M3 9h9a4 4 0 010 8h-2" /></svg>
        </ToolButton>
        <ToolButton label="Redo" disabled={!future.length} onClick={redo}>
          <svg {...iconProps}><path d="M13 5l4 4-4 4M17 9H8a4 4 0 000 8h2" /></svg>
        </ToolButton>
        <span className="mx-1 h-6 w-px bg-line" />
        <button type="button" disabled={!selSeg || isSmooth(selSeg)} onClick={() => sel && commit(makeSmooth(g, sel.c, sel.s))} className="h-10 rounded-[10px] border border-[#BDCFC2] bg-white px-3 text-sm font-bold hover:bg-paper disabled:opacity-40">
          Make smooth
        </button>
        <button type="button" disabled={!selSeg || (!selSeg.hi.x && !selSeg.hi.y && !selSeg.ho.x && !selSeg.ho.y)} onClick={() => sel && commit(makeCorner(g, sel.c, sel.s))} className="h-10 rounded-[10px] border border-[#BDCFC2] bg-white px-3 text-sm font-bold hover:bg-paper disabled:opacity-40">
          Make corner
        </button>
        <button type="button" disabled={!sel} onClick={() => sel && commit(reverseContour(g, sel.c))} title="Turns a filled shape into a hole, or a hole into a filled shape" className="h-10 rounded-[10px] border border-[#BDCFC2] bg-white px-3 text-sm font-bold hover:bg-paper disabled:opacity-40">
          Fill ↔ hole
        </button>
      </div>

      <div className="flex flex-wrap items-start gap-4">
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3">
      <div className="relative overflow-hidden rounded-[14px] bg-[#F3F9F5]">
        <svg
          ref={svgRef}
          viewBox={`${vbx} ${vby} ${vw} ${vh}`}
          className="block h-auto w-full touch-none select-none"
          style={{ cursor: tool === "pen" ? "crosshair" : tool === "erase" ? "not-allowed" : cam.z > 1 ? "grab" : "default" }}
          data-testid="editor-svg"
          data-vb={`${vbx} ${vby} ${vw} ${vh}`}
          data-zoom={cam.z}
          onPointerDown={onSvgDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onLostPointerCapture={onUp}
          onDoubleClick={onDouble}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <g ref={gRef} transform="scale(1,-1)">
            {/* guides */}
            {[[TOP, "Top", false], [TOP / 2, "Mid", false], [0, "Baseline", true], [DESC, "Descender", false]].map(([y, name, strong]) => (
              <g key={name as string}>
                <line x1={vbx} x2={vbx + vw} y1={y as number} y2={y as number} stroke={strong ? TEAL : "#BDCFC2"} strokeWidth={(strong ? 1.6 : 1) * u} strokeDasharray={strong ? undefined : `${6 * u} ${5 * u}`} />
                <text transform="scale(1,-1)" x={vbx + 12 * u} y={-(y as number) - 6 * u} fontSize={12 * u} fill={strong ? TEAL : "#5D797B"} fontWeight={strong ? 700 : 400}>{name as string}</text>
              </g>
            ))}
            {!isMark && [0, g.adv].map((x) => (
              <line key={x} x1={x} x2={x} y1={DESC} y2={TOP} stroke="#BDCFC2" strokeWidth={1 * u} strokeDasharray={`${3 * u} ${4 * u}`} />
            ))}
            {isMark && <line x1={0} x2={0} y1={DESC} y2={TOP} stroke="#BDCFC2" strokeWidth={1 * u} strokeDasharray={`${3 * u} ${4 * u}`} />}

            {/* the starter letter, only as a hint for a letter that has no drawing yet */}
            {!hasShape && !pen && (
              <text transform={`translate(${cx} 0) scale(${ghostS} ${-ghostS}) translate(${-cx} 0)`} x={cx} y={0} textAnchor="middle" fontSize={1000} fontFamily="AKRasmee, NotoThaana, sans-serif" fill={INK} opacity={0.1} aria-hidden>
                {cell.label}
              </text>
            )}

            {/* outlines */}
            {view.contours.map((ct, c) => (
              <path
                key={c}
                d={contoursToD([ct])}
                fill={INK}
                fillOpacity={previewing ? 0.7 : sel?.c === c ? 0.78 : 0.88}
                fillRule="nonzero"
                stroke={sel?.c === c ? TEAL : "none"}
                strokeWidth={2 * u}
                style={{ cursor: tool === "erase" ? "pointer" : undefined }}
                data-contour={c}
                onPointerDown={tool === "erase" ? (e) => { e.stopPropagation(); commit(deleteContour(g, c)); setSel(null); } : undefined}
              />
            ))}

            {/* points */}
            {tool !== "pen" && showPts && !previewing && g.contours.map((ct, c) => ct.map((sg, s) => {
              const on = sel?.c === c && sel.s === s;
              return (
                <g key={`${c}-${s}`}>
                  <rect x={sg.p.x - node} y={sg.p.y - node} width={node * 2} height={node * 2} fill={on ? CORAL : "#fff"} stroke={on ? CORAL : TEAL} strokeWidth={line * 1.3} pointerEvents="none" />
                  <circle cx={sg.p.x} cy={sg.p.y} r={hit} fill="transparent" data-node={`${c}-${s}`} style={{ cursor: tool === "erase" ? "pointer" : "grab" }} onPointerDown={(e) => onNodeDown(e, "pt", c, s)} />
                </g>
              );
            }))}

            {/* handles of the selected point */}
            {tool !== "pen" && showPts && !previewing && sel && selSeg && (["hi", "ho"] as const).map((k) => {
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
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-xl border border-line bg-white/95 p-1 shadow-sm" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" disabled={cam.z <= ZOOM_MIN} onClick={() => zoomTo(cam.z / 1.5)} className="h-8 w-8 rounded-lg text-lg font-bold hover:bg-paper disabled:opacity-40">−</button>
          <button type="button" aria-label="Back to the whole view" onClick={() => zoomTo(1)} data-testid="zoom-level" className="h-8 min-w-[52px] rounded-lg px-1.5 text-[13px] font-bold tabular-nums hover:bg-paper">{Math.round(cam.z * 100)}%</button>
          <button type="button" aria-label="Zoom in" disabled={cam.z >= ZOOM_MAX} onClick={() => zoomTo(cam.z * 1.5)} className="h-8 w-8 rounded-lg text-lg font-bold hover:bg-paper disabled:opacity-40">+</button>
          <button type="button" aria-label="Zoom to the letter" onClick={fitInk} disabled={!hasShape} className="h-8 rounded-lg px-2 text-[13px] font-bold hover:bg-paper disabled:opacity-40">Fit letter</button>
        </div>
      </div>
      <p className="px-1 text-[13px] leading-snug text-muted" aria-live="polite">
        {previewing
          ? "Previewing your changes. Press Apply to keep them, or Reset."
          : tool === "pen"
          ? pen?.length
            ? pen.length < 3 ? "Keep clicking to add points. Drag while clicking to make a curve." : "Click the first point or press Enter to close the shape."
            : "Click to start a shape. Drag while clicking to make a curve."
          : tool === "erase"
            ? "Click a point to remove it, or click a shape to remove all of it."
            : hasShape
              ? "Drag a point or its handles. Double-click the outline to add a point."
              : "Nothing drawn yet. Use the pen, or paste artwork from Illustrator with Ctrl or ⌘ V."}
      </p>

      {notice && (
        <p role="status" data-testid="paste-notice" className="flex items-start justify-between gap-3 rounded-xl bg-sand px-3.5 py-2.5 text-[13px] leading-snug">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="font-bold">×</button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" checked={showPts} onChange={(e) => setShowPts(e.target.checked)} className="h-[18px] w-[18px] accent-teal" />
          Show points
        </label>
        <button
          type="button"
          disabled={!original && !hasShape}
          onClick={() => {
            const base = original ? clone(original) : emptyGlyph(cell.id, cell.cp, cell.kind);
            commit(base);
            setSel(null); setPen(null);
          }}
          className="font-bold text-teal underline underline-offset-4 disabled:opacity-40 disabled:no-underline"
        >
          {original ? "Back to my drawing" : "Clear this letter"}
        </button>
      </div>
      </div>
      <ShapePanel shape={shape} onShape={setShape} onApply={applyShapeNow} view={view} disabled={!hasShape} />
      </div>
    </div>
  );
}
