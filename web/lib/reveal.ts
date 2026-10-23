import type { SyntheticEvent } from "react";

/** When a "More" section opens below the fold, bring it into view instead of leaving it off screen. */
export function revealOnOpen(e: SyntheticEvent<HTMLDetailsElement>) {
  const d = e.currentTarget;
  if (!d.open) return;
  window.setTimeout(() => d.scrollIntoView({ block: "nearest", behavior: "smooth" }), 230);
}
