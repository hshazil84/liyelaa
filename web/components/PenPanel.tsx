"use client";

import { LIMIT_MAX, LIMIT_MIN, penStrokeD, WEIGHT_MAX, WEIGHT_MIN, type PenAlign, type PenCap, type PenJoin, type PenMode, type PenOpts } from "@/lib/handwriting/penstroke";
import { UNITS_PER_MM, type Seg } from "@/lib/handwriting/types";
import { revealOnOpen } from "@/lib/reveal";

const mm = (u: number) => `${(Math.round((u / UNITS_PER_MM) * 10) / 10).toString()} mm`;
const dot = (x: number, y: number): Seg => ({ p: { x, y }, hi: { x: 0, y: 0 }, ho: { x: 0, y: 0 } });
/** A line with one sharp corner, so the ends and the corner show in the picture. Thaana runs right to left, so it starts at the right. */
const SAMPLE: Seg[] = [dot(680, -50), dot(470, 55), dot(310, -45), dot(120, 50)];

const cap = "text-xs font-bold uppercase tracking-wider text-plum";
const btn = (on: boolean) => `rounded-[14px] border-[1.5px] text-xs font-bold ${on ? "border-plum bg-lilac-soft text-plum" : "border-[#BDCFC2] bg-white hover:bg-lilac-soft/60"}`;
const plain = "min-h-[44px] rounded-xl border border-[#BDCFC2] bg-white px-2 text-sm font-bold hover:bg-lilac-soft/60 disabled:opacity-40";
const main = "min-h-[44px] rounded-xl border border-plum bg-plum px-2 text-sm font-bold text-white hover:opacity-90 disabled:border-[#BDCFC2] disabled:bg-white disabled:text-ink disabled:opacity-40";

const INK = "#264022", PLUM = "#55303C";
const ICON_CAP: Record<PenCap, "butt" | "round" | "square"> = { flat: "butt", round: "round", square: "square" };
const ICON_JOIN: Record<PenJoin, "miter" | "round" | "bevel"> = { sharp: "miter", round: "round", bevel: "bevel" };

function CapIcon({ v }: { v: PenCap }) {
  return <svg viewBox="0 0 36 36" className="h-8 w-8" aria-hidden><line x1="8" y1="18" x2="22" y2="18" stroke={PLUM} strokeWidth="12" strokeLinecap={ICON_CAP[v]} /><line x1="22" y1="6" x2="22" y2="30" stroke="#BDCFC2" strokeWidth="1" strokeDasharray="2 2" /></svg>;
}
function JoinIcon({ v }: { v: PenJoin }) {
  return <svg viewBox="0 0 36 36" className="h-8 w-8" aria-hidden><polyline points="8,30 18,10 28,30" fill="none" stroke={PLUM} strokeWidth="8" strokeLinejoin={ICON_JOIN[v]} strokeMiterlimit="10" /></svg>;
}
function AlignIcon({ v }: { v: PenAlign }) {
  const [x, w] = v === "centre" ? [8, 20] : v === "inside" ? [11, 14] : [5, 26];
  return <svg viewBox="0 0 36 36" className="h-8 w-8" aria-hidden><rect x={x} y={x} width={w} height={w} fill="none" stroke={PLUM} strokeWidth="6" /><rect x="8" y="8" width="20" height="20" fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="2 2" /></svg>;
}

const CAPS: [PenCap, string][] = [["flat", "Flat"], ["round", "Round"], ["square", "Square"]];
const JOINS: [PenJoin, string][] = [["sharp", "Sharp"], ["round", "Round"], ["bevel", "Bevel"]];
const ALIGNS: [PenAlign, string][] = [["centre", "Centre"], ["inside", "Inside"], ["outside", "Outside"]];

type Fields = { o: PenOpts; onO: (o: PenOpts) => void };

/** The settings of a line: weight, ends, corners, where a closed line sits, and the fill. Used while drawing and when changing a finished line. */
export function StrokeFields({ o, onO }: Fields) {
  const set = (p: Partial<PenOpts>) => onO({ ...o, ...p });
  const group = <T extends string>(label: string, key: "cap" | "join" | "align", items: [T, string][], icon: (v: T) => React.ReactNode) => (
    <div className="flex flex-col gap-2">
      <span className={cap}>{label}</span>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
        {items.map(([v, name]) => (
          <button key={v} type="button" role="radio" aria-checked={o[key] === v} data-testid={`pen-${key}-${v}`} onClick={() => set({ [key]: v } as Partial<PenOpts>)}
            className={`flex flex-col items-center gap-0.5 px-1 pb-1.5 pt-1.5 ${btn(o[key] === v)}`}>
            {icon(v)}{name}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span className="flex justify-between"><span>Weight</span><span className="font-normal text-muted" data-testid="pen-weight-value">{mm(o.weight)}</span></span>
        <input type="range" min={WEIGHT_MIN} max={WEIGHT_MAX} step={1} value={o.weight} aria-label="Weight" data-testid="pen-weight"
          onChange={(e) => set({ weight: Number(e.target.value) })} className="accent-plum" />
      </label>
      {group("Ends", "cap", CAPS, (v) => <CapIcon v={v} />)}
      {group("Corners", "join", JOINS, (v) => <JoinIcon v={v} />)}
      <div className="flex flex-col gap-1.5">
        {group("Line sits", "align", ALIGNS, (v) => <AlignIcon v={v} />)}
        <span className="text-xs text-muted">For closed lines. An open line always sits on its dots.</span>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={o.fill} data-testid="pen-fill" onChange={(e) => set({ fill: e.target.checked })} className="h-[18px] w-[18px] accent-plum" />
        Fill the inside of a closed line
      </label>
      <details className="border-t border-line pt-3" onToggle={revealOnOpen}>
        <summary className="cursor-pointer text-sm font-bold">More</summary>
        <label className="mt-3 flex flex-col gap-1.5 text-sm font-medium">
          <span className="flex justify-between"><span>Sharp corner limit</span><span className="font-normal text-muted" data-testid="pen-limit-value">{o.limit}</span></span>
          <input type="range" min={LIMIT_MIN} max={LIMIT_MAX} step={0.5} value={o.limit} aria-label="Sharp corner limit" data-testid="pen-limit"
            onChange={(e) => set({ limit: Number(e.target.value) })} className="accent-plum" />
        </label>
      </details>
    </>
  );
}

/** A finished line picked in the Edit tool: its settings, and what can be done with the line. */
export function StrokePanel({ o, onO, onCurve, onShape, onDelete, dotIsCurved }: Fields & { onCurve: (curved: boolean) => void; onShape: () => void; onDelete: () => void; dotIsCurved: boolean | null }) {
  return (
    <div className="flex flex-col gap-4" data-testid="stroke-panel">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={dotIsCurved === null || dotIsCurved} data-testid="stroke-curved" onClick={() => onCurve(true)} className={plain}>Curved</button>
        <button type="button" disabled={dotIsCurved === null || !dotIsCurved} data-testid="stroke-sharp" onClick={() => onCurve(false)} className={plain}>Sharp corner</button>
      </div>
      <StrokeFields o={o} onO={onO} />
      <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
        <button type="button" data-testid="stroke-to-shape" onClick={onShape} title="The line becomes an ordinary shape you edit point by point" className={plain}>Make it a shape</button>
        <button type="button" data-testid="stroke-delete" onClick={onDelete} className={plain}>Delete line</button>
      </div>
    </div>
  );
}

/** The pen's settings: shape or stroke, and for a stroke its weight, ends, corners and where a closed line sits. */
export function PenPanel({ o, onO, dots, onUndo, onFinish, onReset }: {
  o: PenOpts;
  onO: (o: PenOpts) => void;
  dots: number;
  onUndo: () => void;
  onFinish: (closed: boolean) => void;
  onReset: () => void;
}) {
  const set = (p: Partial<PenOpts>) => onO({ ...o, ...p });
  const stroke = o.mode === "stroke";
  const sample = stroke ? penStrokeD(SAMPLE, false, o) : "";
  const modes: [PenMode, string][] = [["shape", "Shape"], ["stroke", "Stroke"]];
  return (
    <div className="flex flex-col gap-4" data-testid="pen-panel">
      <div role="radiogroup" aria-label="What the pen draws" className="grid grid-cols-2 gap-2">
        {modes.map(([v, name]) => (
          <button key={v} type="button" role="radio" aria-checked={o.mode === v} data-testid={`pen-mode-${v}`} onClick={() => set({ mode: v })}
            className={`min-h-[44px] px-2 text-sm ${btn(o.mode === v)}`}>{name}</button>
        ))}
      </div>

      {stroke ? (
        <>
          <svg viewBox="0 -150 800 300" className="w-full rounded-xl bg-lilac-soft" role="img" aria-label="A sample line with these settings" data-testid="pen-preview">
            <g transform="scale(1,-1)"><path d={sample} fill={INK} fillRule="nonzero" /></g>
          </svg>
          <StrokeFields o={o} onO={onO} />
        </>
      ) : (
        <div role="radiogroup" aria-label="Draw as" className="grid grid-cols-2 gap-2">
          {([[false, "Filled shape"], [true, "Hole"]] as [boolean, string][]).map(([v, name]) => (
            <button key={name} type="button" role="radio" aria-checked={o.hole === v} data-testid={v ? "pen-hole" : "pen-solid"} onClick={() => set({ hole: v })}
              className={`min-h-[44px] px-2 text-sm ${btn(o.hole === v)}`}>{name}</button>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={o.snap} data-testid="pen-snap" onChange={(e) => set({ snap: e.target.checked })} className="h-[18px] w-[18px] accent-plum" />
        Snap dots to the lines
      </label>

      <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
        <button type="button" disabled={dots < 1} data-testid="pen-undo" onClick={onUndo} className={plain}>Undo last dot</button>
        <button type="button" disabled={dots < 1} data-testid="pen-reset" onClick={onReset} className={plain}>Start over</button>
        {stroke ? (
          <>
            <button type="button" disabled={dots < 2} data-testid="pen-finish" onClick={() => onFinish(false)} className={main}>Finish line</button>
            <button type="button" disabled={dots < 3} data-testid="pen-close" onClick={() => onFinish(true)} className={plain}>Close line</button>
          </>
        ) : (
          <button type="button" disabled={dots < 3} data-testid="pen-close" onClick={() => onFinish(true)} className={`${main} col-span-2`}>Close shape</button>
        )}
      </div>
    </div>
  );
}
