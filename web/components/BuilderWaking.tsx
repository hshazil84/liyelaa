"use client";

import { useEffect, useState } from "react";

/** True once `on` has been true for `ms`, so a slow wait can say what is going on. */
export function useSlow(on: boolean, ms = 4000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!on) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(t);
  }, [on, ms]);
  return slow;
}

/** Shown when a font build is taking longer than usual, so the wait does not look stuck. */
export function BuilderWaking() {
  return (
    <div role="status" data-testid="builder-waking" className="flex items-center gap-3 rounded-xl bg-[#F3F9F5] px-3.5 py-3 text-[13px] leading-snug">
      <span aria-hidden className="h-4 w-4 flex-none rounded-full border-[2.5px] border-[#BDCFC2] border-t-ink motion-safe:animate-spin" />
      <span>Still working on it. The first one can take a little longer.</span>
    </div>
  );
}
