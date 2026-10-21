import { contoursToD } from "@/lib/handwriting/svg";
import type { CellResult, Glyph } from "@/lib/handwriting/types";

/** A fixed window on the font grid, so every tile shows letters at the same scale. */
export function GlyphSvg({ glyph, className }: { glyph: Glyph; className?: string }) {
  const isMark = glyph.kind === "fili";
  const x = isMark ? -330 : -40;
  const w = isMark ? 660 : Math.max(glyph.adv + 80, 360);
  return (
    <svg viewBox={`${x} -820 ${w} 1180`} className={className} aria-hidden>
      <g transform="scale(1,-1)">
        <path d={contoursToD(glyph.contours)} fill="#264022" fillRule="nonzero" />
        <line x1={x} x2={x + w} y1={0} y2={0} stroke="#BDCFC2" strokeWidth={4} />
      </g>
    </svg>
  );
}

const STATUS: Record<string, string> = {
  ok: "border-line bg-white",
  light: "border-coral bg-coral-soft",
  empty: "border-dashed border-[#BDCFC2] bg-paper",
};

export function GlyphTile({ cell }: { cell: CellResult }) {
  const note = cell.status === "light" ? "Too light" : cell.status === "empty" ? "Empty" : cell.warn;
  return (
    <li
      className={`flex flex-col items-center gap-1 rounded-xl border p-1.5 ${cell.warn ? "border-coral bg-white" : STATUS[cell.status]}`}
      title={`U+${cell.id}${note ? ` · ${note}` : ""}`}
      data-cell={cell.id}
      data-status={cell.status}
    >
      <div className="flex h-[72px] w-full items-center justify-center">
        {cell.glyph ? (
          <GlyphSvg glyph={cell.glyph} className="h-full w-full" />
        ) : (
          <span lang="dv" className="font-thaana text-[28px] leading-none text-[#BDCFC2]">{cell.label}</span>
        )}
      </div>
      <span className="text-[10px] tabular-nums text-muted">{cell.id}</span>
    </li>
  );
}
