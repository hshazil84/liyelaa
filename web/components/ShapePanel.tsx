"use client";

import { IDENTITY, isIdentity, type Shape } from "@/lib/handwriting/shape";
import { revealOnOpen } from "@/lib/reveal";

type Num = Exclude<keyof Shape, "flip" | "seed">;
const SLIDERS: { key: Num; label: string; min: number; max: number; fmt: (v: number) => string }[] = [
  { key: "smooth", label: "Smooth edges", min: 0, max: 100, fmt: (v) => String(v) },
  { key: "weight", label: "Weight", min: -30, max: 40, fmt: (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0") },
  { key: "size", label: "Size", min: 50, max: 150, fmt: (v) => `${v}%` },
  { key: "width", label: "Width", min: 60, max: 140, fmt: (v) => `${v}%` },
  { key: "slant", label: "Slant", min: -25, max: 25, fmt: (v) => `${v}°` },
  { key: "lift", label: "Up or down", min: -120, max: 120, fmt: (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0") },
  { key: "rough", label: "Rough edges", min: 0, max: 100, fmt: (v) => String(v) },
  { key: "chips", label: "Chips and scratches", min: 0, max: 100, fmt: (v) => String(v) },
  { key: "bleed", label: "Ink bleed", min: 0, max: 100, fmt: (v) => String(v) },
];

/** Ready-made grunge: how rough the edge is, how much is chipped away, how far the ink spreads. */
const GRUNGE = [
  { id: "clean", label: "Clean", rough: 0, chips: 0, bleed: 0 },
  { id: "worn", label: "Worn", rough: 30, chips: 25, bleed: 8 },
  { id: "scratchy", label: "Scratchy", rough: 55, chips: 50, bleed: 18 },
  { id: "horror", label: "Horror", rough: 85, chips: 75, bleed: 30 },
] as const;

const cap = "text-xs font-bold uppercase tracking-wider text-muted";
const quick = "min-h-[44px] rounded-xl border border-[#BDCFC2] bg-white px-3 text-sm font-bold hover:bg-paper";

/** Changes for the whole letter. They only preview until Apply, so nothing is lost by trying them. */
export function ShapePanel({
  shape, onShape, onApply, disabled,
}: {
  shape: Shape; onShape: (s: Shape) => void; onApply: () => void; disabled: boolean;
}) {
  const changed = !isIdentity(shape);
  const grungeOn = shape.rough > 0 || shape.chips > 0 || shape.bleed > 0;
  const grungeNow = GRUNGE.find((x) => x.rough === shape.rough && x.chips === shape.chips && x.bleed === shape.bleed)?.id;
  if (disabled) return <p className="rounded-xl bg-[#F3F9F5] px-3 py-2.5 text-sm text-muted" data-testid="shape-panel">Draw the letter first.</p>;
  return (
    <div className="flex flex-col gap-4" data-testid="shape-panel">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={quick} onClick={() => onShape({ ...shape, smooth: Math.max(shape.smooth, 50) })}>Smooth it</button>
        <button type="button" className={quick} onClick={() => onShape({ ...shape, weight: Math.min(40, shape.weight + 10) })}>Bolder</button>
        <button type="button" className={quick} onClick={() => onShape({ ...shape, weight: Math.max(-30, shape.weight - 10) })}>Thinner</button>
        <button type="button" aria-pressed={shape.flip} className={`${quick} ${shape.flip ? "!border-ink !bg-ink text-white hover:!bg-ink" : ""}`} onClick={() => onShape({ ...shape, flip: !shape.flip })}>Flip sideways</button>
      </div>

      <div className="flex flex-col gap-2">
        <span className={cap}>Grunge</span>
        <div role="radiogroup" aria-label="Grunge" className="grid grid-cols-4 gap-2">
          {GRUNGE.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={grungeNow === x.id} data-testid={`grunge-${x.id}`}
              onClick={() => onShape({ ...shape, rough: x.rough, chips: x.chips, bleed: x.bleed })}
              className={`rounded-[12px] border-[1.5px] px-1 py-2 text-xs font-bold ${grungeNow === x.id ? "border-ink bg-teal-soft" : "border-[#BDCFC2] bg-white hover:bg-paper"}`}>
              {x.label}
            </button>
          ))}
        </div>
        <button type="button" disabled={!grungeOn} data-testid="grunge-shuffle" onClick={() => onShape({ ...shape, seed: 2 + Math.floor(Math.random() * 98) })} className={`${quick} disabled:opacity-40`}>
          Shuffle the damage
        </button>
      </div>

      <details className="border-t border-line pt-3" data-testid="shape-more" onToggle={revealOnOpen}>
        <summary className="cursor-pointer text-sm font-bold">More controls</summary>
        <div className="mt-3 flex flex-col gap-3.5">
          {SLIDERS.map((it) => (
            <div key={it.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-sm font-medium">
                <label htmlFor={`shape-${it.key}`}>{it.label}</label>
                <output className="tabular-nums text-muted" htmlFor={`shape-${it.key}`} data-testid={`shape-${it.key}-value`}>{it.fmt(shape[it.key])}</output>
              </div>
              <input id={`shape-${it.key}`} type="range" min={it.min} max={it.max} value={shape[it.key]} onChange={(e) => onShape({ ...shape, [it.key]: Number(e.target.value) })} />
            </div>
          ))}
        </div>
      </details>

      <div className="flex gap-2">
        <button type="button" disabled={!changed} onClick={onApply} data-testid="shape-apply" className="h-11 flex-1 rounded-xl bg-teal text-[15px] font-bold text-white hover:bg-teal-dark disabled:opacity-40">
          Apply to this letter
        </button>
        <button type="button" disabled={!changed} onClick={() => onShape({ ...IDENTITY })} data-testid="shape-reset" className="h-11 rounded-xl border border-[#BDCFC2] bg-white px-4 text-[15px] font-bold hover:bg-paper disabled:opacity-40">
          Reset
        </button>
      </div>
    </div>
  );
}
