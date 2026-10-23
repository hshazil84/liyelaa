import type { FontMeta } from "./store";

/** Where to land when a font is opened: its letters if it has any, otherwise the start of the way it was begun. */
export function fontHome(f: Pick<FontMeta, "count" | "path">): string {
  if (f.count > 0) return "/handwriting/letters";
  return f.path === "draw" ? "/draw/start" : "/handwriting";
}

/** A full page load, so every step starts again from the font that was just opened. */
export function go(href: string) {
  window.location.assign(href);
}
