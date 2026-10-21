import { contoursToD } from "@/lib/handwriting/svg";
import type { Glyph } from "@/lib/handwriting/types";

/** The same letter at three reading sizes. */
export function SizeCheck({ glyph }: { glyph?: Glyph | null }) {
  if (!glyph || !glyph.contours.length) {
    return <p className="text-[13px] leading-snug text-muted">Draw this letter to see it at reading sizes.</p>;
  }
  const mark = glyph.kind === "fili";
  const x = mark ? -260 : -30, w = mark ? 520 : glyph.adv + 60;
  return (
    <div className="flex items-end justify-center gap-5 rounded-[14px] bg-[#F3F9F5] px-3 py-4" data-testid="size-check">
      {[96, 48, 24].map((px) => (
        <svg key={px} viewBox={`${x} -600 ${w} 950`} style={{ height: px * 0.95, width: (px * 0.95 * w) / 950 }} aria-label={`${px} pixels`} role="img">
          <g transform="scale(1,-1)">
            <path d={contoursToD(glyph.contours)} fill="#264022" fillRule="nonzero" />
          </g>
        </svg>
      ))}
    </div>
  );
}
