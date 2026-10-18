export type BaseId = "noto" | "sangu";

export const BASES: { id: BaseId; label: string; blurb: string; credit: string; variable: boolean }[] = [
  { id: "noto", label: "Noto Sans Thaana", blurb: "Clean and simple · 9 weights", credit: "Noto Sans Thaana", variable: true },
  { id: "sangu", label: "Sangu Suruhee", blurb: "Bold and calligraphic · one weight", credit: "Sangu Suruhee by Thaana Type Foundry", variable: false },
];

export const baseOf = (id: BaseId) => BASES.find((b) => b.id === id) ?? BASES[0];

export type PlaySettings = {
  base: BaseId;
  weight: number;   // 100..900
  width: number;    // percent, 70..140
  slant: number;    // degrees, -15..15
  spacing: number;  // font units (of 1000), -100..200
  name: string;
};

export const DEFAULTS: PlaySettings = { base: "noto", weight: 400, width: 100, slant: 0, spacing: 0, name: "My Dhivehi Font" };

export const PRESETS: { label: string; weight: number }[] = [
  { label: "Thin", weight: 100 },
  { label: "Regular", weight: 400 },
  { label: "Bold", weight: 700 },
  { label: "Black", weight: 900 },
];

export const LIMITS = {
  weight: { min: 100, max: 900, step: 10 },
  width: { min: 70, max: 140, step: 1 },
  slant: { min: -15, max: 15, step: 1 },
  spacing: { min: -100, max: 200, step: 5 },
} as const;

export const BUILDER_URL = process.env.NEXT_PUBLIC_BUILDER_URL ?? "http://localhost:8000";

export function cleanName(raw: string): string {
  return raw.replace(/[^A-Za-z0-9 \-]/g, "").slice(0, 40);
}

export function weightName(w: number): string {
  if (w <= 150) return "Thin";
  if (w <= 250) return "Extra light";
  if (w <= 350) return "Light";
  if (w <= 450) return "Regular";
  if (w <= 550) return "Medium";
  if (w <= 650) return "Semibold";
  if (w <= 750) return "Bold";
  if (w <= 850) return "Extra bold";
  return "Black";
}

/** What the live preview should look like. The real font is built by the builder with the same numbers. */
export function previewStyle(s: PlaySettings, builtFamily?: string | null): React.CSSProperties {
  if (!baseOf(s.base).variable) {
    // A one-weight font cannot be thinned or thickened by CSS, so the builder makes the preview font.
    // It already has width, slant and spacing in it, so nothing is applied here.
    return { fontFamily: `${builtFamily ?? "SanguSuruhee"}, sans-serif`, display: "inline-block", whiteSpace: "nowrap" };
  }
  const sx = s.width / 100;
  return {
    fontFamily: "NotoThaana, sans-serif",
    fontVariationSettings: `"wght" ${s.weight}`,
    transform: `scaleX(${sx}) skewX(${-s.slant}deg)`,
    transformOrigin: "100% 50%",
    letterSpacing: `${s.spacing / 1000 / sx}em`,
    display: "inline-block",
    whiteSpace: "nowrap",
  };
}

export function changes(s: PlaySettings): string[] {
  const out = [baseOf(s.base).label, `${weightName(s.weight)} (${s.weight})`];
  if (s.width !== 100) out.push(`Width ${s.width}%`);
  if (s.slant !== 0) out.push(`Slant ${s.slant}°`);
  if (s.spacing !== 0) out.push(`Spacing ${s.spacing > 0 ? "+" : ""}${s.spacing}`);
  return out;
}

export type BuildFormat = "zip" | "ttf" | "woff2";

export async function buildFont(s: PlaySettings, format: BuildFormat, signal?: AbortSignal): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${BUILDER_URL}/play/build`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...s, name: cleanName(s.name).trim() || DEFAULTS.name, format }),
  });
  if (!res.ok) throw new Error(res.status === 422 ? "Those settings are out of range." : "The font builder had a problem.");
  const cd = res.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? `font.${format}`;
  return { blob: await res.blob(), filename };
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

let faceCounter = 0;

/** Ask the builder for the real font with these settings and load it for the preview. */
export async function loadPreviewFace(s: PlaySettings, signal: AbortSignal): Promise<{ family: string; face: FontFace }> {
  const { blob } = await buildFont(s, "woff2", signal);
  const family = `PlayPreview${++faceCounter}`;
  const face = new FontFace(family, await blob.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  return { family, face };
}
