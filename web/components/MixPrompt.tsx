"use client";

import { useEffect } from "react";

/** Shown when letters from one source are about to go into a font that already holds letters from another. */
export function MixPrompt({ fontName, have, haveKind, adding, onAdd, onNew, onCancel }: {
  fontName: string; have: number; haveKind: "photo" | "drawn"; adding: string;
  onAdd: () => void; onNew: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const from = haveKind === "photo" ? "traced from a photo" : "drawn or imported";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="mix-title" data-testid="mix-prompt" className="flex w-full max-w-[460px] flex-col gap-4 rounded-3xl bg-white p-6 shadow-xl">
        <h2 id="mix-title" className="font-display text-xl font-bold">This font already has letters</h2>
        <p className="text-base text-muted"><b className="text-ink">{fontName}</b> has {have} {have === 1 ? "letter" : "letters"} {from}. You are about to add {adding}.</p>
        <p className="rounded-xl bg-sand px-4 py-3 text-sm font-medium">Adding replaces only the letters that match. The others stay as they are.</p>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" data-testid="mix-add" onClick={onAdd} className="h-12 rounded-xl bg-teal px-5 text-base font-bold text-white hover:bg-teal-dark">Add to {fontName.length > 22 ? "this font" : fontName}</button>
          <button type="button" data-testid="mix-new" onClick={onNew} className="h-12 rounded-xl border border-[#BDCFC2] px-5 text-base font-bold hover:bg-paper">Start a new font instead</button>
        </div>
      </div>
    </div>
  );
}
