"use client";

import { SizeCheck } from "@/components/SizeCheck";
import { IDENTITY, isIdentity, type Shape } from "@/lib/handwriting/shape";
import type { Glyph } from "@/lib/handwriting/types";

type Num = Exclude<keyof Shape, "flip">;
const SLIDERS: { group: string; note?: string; items: { key: Num; label: string; min: number; max: number; lo: string; hi: string; fmt: (v: number) => string }[] }[] = [
  {
    group: "Edges", note: "Smooth evens out wobbles from the photo and removes extra points.",
    items: [
      { key: "smooth", label: "Smooth edges", min: 0, max: 100, lo: "As drawn", hi: "Very smooth", fmt: (v) => String(v) },
      { key: "rough", label: "Roughen edges", min: 0, max: 100, lo: "Clean", hi: "Rough", fmt: (v) => String(v) },
    ],
  },
  {
    group: "Thickness and size",
    items: [
      { key: "weight", label: "Weight", min: -30, max: 40, lo: "Thinner", hi: "Bolder", fmt: (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0") },
      { key: "size", label: "Size", min: 50, max: 150, lo: "Smaller", hi: "Bigger", fmt: (v) => `${v}%` },
      { key: "width", label: "Width", min: 60, max: 140, lo: "Narrow", hi: "Wide", fmt: (v) => `${v}%` },
    ],
  },
  {
    group: "Slant and position",
    items: [
      { key: "slant", label: "Slant", min: -25, max: 25, lo: "Lean left", hi: "Lean right", fmt: (v) => `${v}°` },
      { key: "lift", label: "Up or down", min: -120, max: 120, lo: "Lower", hi: "Higher", fmt: (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0") },
    ],
  },
];

/** Sliders that change the whole letter. They only preview until Apply, so nothing is lost by sliding around. */
export function ShapePanel({
  shape, onShape, onApply, view, disabled,
}: {
  shape: Shape; onShape: (s: Shape) => void; onApply: () => void; view: Glyph; disabled: boolean;
}) {
  const changed = !isIdentity(shape);
  return (
    <aside aria-label="Shape tools" className="flex w-full flex-col gap-4 rounded-2xl border border-line bg-white p-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:w-[300px] xl:shrink-0 xl:overflow-y-auto" data-testid="shape-panel">
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-base font-bold">Size check</h3>
        <SizeCheck glyph={view} />
      </div>

      {disabled ? (
        <p className="rounded-xl bg-[#F3F9F5] px-3 py-2.5 text-sm text-muted">Draw the letter first. Then these sliders can change it.</p>
      ) : (
        SLIDERS.map((grp) => (
          <div key={grp.group} className="flex flex-col gap-3.5 border-t border-line pt-4">
            <h3 className="font-display text-base font-bold">{grp.group}</h3>
            {grp.items.map((it) => (
              <div key={it.key} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between text-sm font-medium">
                  <label htmlFor={`shape-${it.key}`}>{it.label}</label>
                  <output className="tabular-nums text-muted" htmlFor={`shape-${it.key}`} data-testid={`shape-${it.key}-value`}>{it.fmt(shape[it.key])}</output>
                </div>
                <input
                  id={`shape-${it.key}`}
                  type="range"
                  min={it.min}
                  max={it.max}
                  value={shape[it.key]}
                  onChange={(e) => onShape({ ...shape, [it.key]: Number(e.target.value) })}
                />
                <div className="flex justify-between text-[12px] text-muted"><span>{it.lo}</span><span>{it.hi}</span></div>
              </div>
            ))}
            {grp.group === "Edges" && <p className="-mt-1 text-[12px] leading-snug text-muted">{grp.note}</p>}
            {grp.group === "Slant and position" && (
              <button
                type="button"
                aria-pressed={shape.flip}
                onClick={() => onShape({ ...shape, flip: !shape.flip })}
                className={`h-10 rounded-xl border text-sm font-bold ${shape.flip ? "border-ink bg-ink text-white" : "border-[#BDCFC2] bg-white hover:bg-paper"}`}
              >
                Flip sideways
              </button>
            )}
          </div>
        ))
      )}

      {!disabled && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <div className="flex gap-2">
            <button type="button" disabled={!changed} onClick={onApply} data-testid="shape-apply" className="h-11 flex-1 rounded-xl bg-teal text-[15px] font-bold text-white hover:bg-teal-dark disabled:opacity-40">
              Apply to this letter
            </button>
            <button type="button" disabled={!changed} onClick={() => onShape({ ...IDENTITY })} data-testid="shape-reset" className="h-11 rounded-xl border border-[#BDCFC2] bg-white px-4 text-[15px] font-bold hover:bg-paper disabled:opacity-40">
              Reset
            </button>
          </div>
          <p className="text-[12px] leading-snug text-muted">The letter only changes when you press Apply. Undo brings it back.</p>
        </div>
      )}
    </aside>
  );
}
