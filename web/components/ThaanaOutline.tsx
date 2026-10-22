import { HOME_THAANA } from "@/lib/home-thaana";

/** Thaana drawn as a vector shape at a given text size, in the surrounding text colour. Needs no font. */
export function ThaanaOutline({ id, size, label }: { id: keyof typeof HOME_THAANA | string; size: number; label?: string }) {
  const o = HOME_THAANA[id];
  const k = size / 1000;
  return (
    <svg
      viewBox={`0 ${-o.asc} ${o.w} ${o.asc + o.desc}`}
      width={Math.round(o.w * k)}
      height={Math.round((o.asc + o.desc) * k)}
      fill="currentColor"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="shrink-0 overflow-visible"
    >
      <path d={o.d} />
    </svg>
  );
}
