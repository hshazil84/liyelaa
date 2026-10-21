import { markShift, shiftContours, type Offset, type Offsets } from "@/lib/handwriting/marks";
import type { Ligature } from "@/lib/handwriting/extras";
import { layoutLine, type Spacing } from "@/lib/handwriting/spacing";
import { contoursToD } from "@/lib/handwriting/svg";
import type { Glyph } from "@/lib/handwriting/types";

/** A letter with one vowel mark on it, small enough for a chip. */
export function Composed({ letter, mark, offset, className }: { letter: Glyph; mark?: Glyph; offset?: Offset; className?: string }) {
  const shift = mark ? markShift(letter, mark, offset) : null;
  return (
    <svg viewBox={`-40 -780 ${Math.max(letter.adv + 80, 420)} 1180`} className={className} aria-hidden>
      <g transform="scale(1,-1)">
        <path d={contoursToD(letter.contours)} fill="#264022" fillRule="nonzero" />
        {mark && shift && <path d={contoursToD(shiftContours(mark.contours, shift))} fill="#264022" fillRule="nonzero" />}
      </g>
    </svg>
  );
}

/** A right-to-left line of text drawn from the person's own letters and marks. */
export function WordSvg({
  text, glyphs, offsets, spacing, ligatures, height, label, children,
}: {
  text: string; glyphs: Record<string, Glyph>; offsets: Offsets; spacing: Spacing; ligatures?: Ligature[]; height: number; label?: string;
  children?: (line: ReturnType<typeof layoutLine>) => React.ReactNode;
}) {
  const line = layoutLine(text, glyphs, offsets, spacing, ligatures);
  const pad = 60;
  return (
    <svg
      viewBox={`${-pad} -760 ${line.width + 2 * pad} 1040`}
      style={{ height, width: (height * (line.width + 2 * pad)) / 1040, maxWidth: "100%" }}
      role="img"
      aria-label={label ?? text}
      data-testid="word"
    >
      <g transform="scale(1,-1)">
        {children?.(line)}
        {line.parts.map((p, i) => (
          <path key={i} transform={`translate(${p.x} ${p.y})`} d={contoursToD(p.glyph.contours)} fill="#264022" fillRule="nonzero" pointerEvents="none" />
        ))}
      </g>
    </svg>
  );
}
