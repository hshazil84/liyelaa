"use client";

import { useEffect, useRef, useState } from "react";
import { go } from "@/lib/handwriting/fonts";
import { createFont } from "@/lib/handwriting/store";

const WAYS = [
  { id: "draw", title: "Draw my own", text: "Draw letters with the pen, or bring in SVG files from Illustrator.", href: "/draw/start" },
  { id: "photo", title: "A photo of my handwriting", text: "Print the sheet, write on it, take a photo.", href: "/handwriting" },
] as const;

export function NewFontDialog({ onClose, suggest = "" }: { onClose: () => void; suggest?: string }) {
  const [name, setName] = useState(suggest);
  const [way, setWay] = useState<"draw" | "photo">("draw");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function make(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    await createFont(name, way);
    go(WAYS.find((w) => w.id === way)!.href);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form role="dialog" aria-modal="true" aria-labelledby="nf-title" data-testid="new-font" onSubmit={make} className="flex w-full max-w-[460px] flex-col gap-4 rounded-3xl bg-white p-6 shadow-xl">
        <h2 id="nf-title" className="font-display text-xl font-bold">New font</h2>
        <label htmlFor="nf-name" className="flex flex-col gap-1.5 text-sm font-bold">
          What is your font called?
          <input id="nf-name" ref={input} data-testid="new-font-name" value={name} maxLength={60} placeholder="My font" onChange={(e) => setName(e.target.value)}
            className="h-12 rounded-xl border border-[#BDCFC2] px-3.5 text-base font-medium focus-visible:outline-2 focus-visible:outline-teal" />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1.5 text-sm font-bold">How will you make the letters?</legend>
          {WAYS.map((w) => (
            <label key={w.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 ${way === w.id ? "border-[1.5px] border-edge bg-teal-soft" : "border-line"}`}>
              <input type="radio" name="nf-way" value={w.id} checked={way === w.id} onChange={() => setWay(w.id)} className="mt-1 h-[18px] w-[18px] accent-teal" />
              <span><b className="block">{w.title}</b><span className="text-[13px] text-muted">{w.text}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-2.5">
          <button type="submit" data-testid="make-font" disabled={busy} className="h-12 rounded-xl bg-teal px-6 text-base font-bold text-white hover:bg-teal-dark disabled:opacity-60">Make font</button>
          <button type="button" onClick={onClose} className="h-12 rounded-xl border border-[#BDCFC2] px-5 text-base font-bold hover:bg-paper">Cancel</button>
        </div>
      </form>
    </div>
  );
}
