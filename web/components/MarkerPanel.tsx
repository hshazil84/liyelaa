"use client";

import { INKS, NIB_LABEL, NIB_START, nibPoly, SIZE_MAX, SIZE_MIN, strokeToD, withShape, type Nib, type NibShape } from "@/lib/handwriting/marker";
import { UNITS_PER_MM } from "@/lib/handwriting/types";

const SHAPES: NibShape[] = ["round", "oval", "chisel", "square"];
const mm = (u: number) => `${(Math.round((u / UNITS_PER_MM) * 10) / 10).toString()} mm`;

/** A sample line drawn with the nib, so every change shows at once. Thaana runs right to left, so it starts at the right. */
const SAMPLE = Array.from({ length: 50 }, (_, i) => { const t = i / 49; return { x: 640 - t * 560, y: Math.sin(t * Math.PI * 1.15 + 0.2) * 70 - t * 10 }; });

function NibIcon({ shape }: { shape: NibShape }) {
  const n = { shape, size: 26, angle: -40, flat: NIB_START[shape].flat, smooth: 0, taper: 0, bleed: 0, dry: 0 };
  const d = nibPoly(n).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${(-y).toFixed(1)}`).join("") + "Z";
  return <svg viewBox="-18 -18 36 36" className="h-9 w-9" aria-hidden><path d={d} fill="#264022" /></svg>;
}

const cap = "text-xs font-bold uppercase tracking-wider text-muted";

/** The marker's settings: a live picture of the nib and its line, the nib shape, size, angle and the ink. */
export function MarkerPanel({ nib, onNib }: { nib: Nib; onNib: (n: Nib) => void }) {
  const angled = NIB_START[nib.shape].angled;
  const sample = strokeToD(SAMPLE, nib);
  const preview = nibPoly(nib, 1.4).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("") + "Z";
  const inkOn = INKS.find((k) => k.bleed === nib.bleed && k.dry === nib.dry)?.id;
  const slide = (key: "size" | "angle" | "flat" | "smooth" | "taper" | "bleed" | "dry", label: string, min: number, max: number, step: number, shown: string, disabled = false) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      <span className="flex justify-between"><span>{label}</span><span className="font-normal text-muted" data-testid={`nib-${key}-value`}>{shown}</span></span>
      <input type="range" min={min} max={max} step={step} value={nib[key]} disabled={disabled} aria-label={label} data-testid={`nib-${key}`}
        onChange={(e) => onNib({ ...nib, [key]: Number(e.target.value) })} className="accent-teal disabled:opacity-40" />
    </label>
  );
  return (
    <div className="flex flex-col gap-4" data-testid="marker-panel">
      <svg viewBox="0 -150 800 300" className="w-full rounded-xl bg-[#F3F9F5]" role="img" aria-label="The nib and a sample line drawn with it" data-testid="nib-preview">
        <g transform="translate(720 0)"><path d={preview} transform="scale(1,-1)" fill="#264022" /></g>
        <line x1="650" x2="650" y1="-130" y2="130" stroke="#DCE8DF" strokeWidth="3" />
        <g transform="scale(1,-1)"><path d={sample} fill="#264022" fillRule="nonzero" /></g>
      </svg>
      <div role="radiogroup" aria-label="Nib shape" className="grid grid-cols-4 gap-2">
        {SHAPES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={nib.shape === s} data-testid={`nib-${s}`} onClick={() => onNib(withShape(nib, s))}
            className={`flex flex-col items-center gap-1 rounded-[14px] border-[1.5px] px-1 pb-1.5 pt-2 text-xs font-bold ${nib.shape === s ? "border-ink bg-teal-soft" : "border-[#BDCFC2] bg-white hover:bg-paper"}`}>
            <NibIcon shape={s} />{NIB_LABEL[s]}
          </button>
        ))}
      </div>
      {slide("size", "Size", SIZE_MIN, SIZE_MAX, 1, mm(nib.size))}
      {slide("angle", "Angle", -90, 90, 1, `${nib.angle}°`, !angled)}
      <div className="flex flex-col gap-2">
        <span className={cap}>Ink</span>
        <div role="radiogroup" aria-label="Ink" className="grid grid-cols-4 gap-2">
          {INKS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={inkOn === k.id} data-testid={`ink-${k.id}`} onClick={() => onNib({ ...nib, bleed: k.bleed, dry: k.dry })}
              className={`rounded-[12px] border-[1.5px] px-1 py-2 text-xs font-bold ${inkOn === k.id ? "border-ink bg-teal-soft" : "border-[#BDCFC2] bg-white hover:bg-paper"}`}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <details className="border-t border-line pt-3" data-testid="marker-more">
        <summary className="cursor-pointer text-sm font-bold">More</summary>
        <div className="mt-3 flex flex-col gap-4">
          {slide("flat", "Flatness", 10, 100, 1, `${nib.flat}%`, nib.shape === "round")}
          {slide("smooth", "Smoothing", 0, 90, 1, `${nib.smooth}%`)}
          {slide("taper", "Taper the ends", 0, 100, 1, `${nib.taper}%`)}
          {slide("bleed", "Ink bleed", 0, 100, 1, String(nib.bleed))}
          {slide("dry", "Dry streaks", 0, 100, 1, String(nib.dry))}
        </div>
      </details>
    </div>
  );
}
