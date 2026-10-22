"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NewFontDialog } from "@/components/NewFontDialog";
import { fontHome, go } from "@/lib/handwriting/fonts";
import { openProjectFile } from "@/lib/handwriting/projectfile";
import { listFonts, switchFont, type FontMeta } from "@/lib/handwriting/store";

/** The name of the font being worked on, with a menu to open another one or start a new one. */
export function FontSwitcher() {
  const [fonts, setFonts] = useState<FontMeta[] | null>(null);
  const [open, setOpen] = useState(false);
  const [making, setMaking] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const load = () => { listFonts().then(setFonts); };
    load();
    window.addEventListener("myakuru-fonts", load);
    return () => window.removeEventListener("myakuru-fonts", load);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const cur = fonts?.find((f) => f.active);
  if (!fonts || !cur) return <span className="h-[42px] w-40" aria-hidden />;

  async function open_(f: FontMeta) {
    setOpen(false);
    if (f.active) return;
    if (await switchFont(f.id)) go(fontHome(f));
  }

  async function openFile(f: File | undefined) {
    if (!f) return;
    const r = await openProjectFile(f);
    setNote(r.ok ? `Opened as “${r.title}”.` : r.reason);
  }

  return (
    <div ref={box} className="relative">
      <button type="button" data-testid="font-switcher" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex h-[42px] max-w-[280px] items-center gap-2.5 rounded-xl border border-[#BDCFC2] bg-white px-3.5 text-[15px] font-bold hover:bg-paper">
        <span className="truncate">{cur.title}</span>
        <span className="hidden whitespace-nowrap text-xs font-medium text-muted sm:inline">{cur.count} of 38 letters</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-none"><path d="M3 5l4 4 4-4" /></svg>
      </button>
      {open && (
        <div role="menu" data-testid="font-menu" className="absolute left-0 top-[48px] z-40 flex min-w-[290px] max-w-[calc(100vw-32px)] flex-col gap-0.5 rounded-2xl border border-line bg-white p-2 shadow-lg">
          <p className="px-3 pb-1 pt-1.5 text-[13px] text-muted">My fonts</p>
          {fonts.map((f) => (
            <button key={f.id} type="button" role="menuitem" data-testid={`font-${f.id}`} onClick={() => open_(f)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left font-medium hover:bg-paper">
              <span className="w-4 font-bold text-teal">{f.active ? "✓" : ""}</span>
              <span className="truncate">{f.title}</span>
              <span className="ml-auto text-xs tabular-nums text-muted">{f.count}/38</span>
            </button>
          ))}
          <hr className="my-1.5 border-line" />
          <button type="button" role="menuitem" data-testid="new-font-open" onClick={() => { setOpen(false); setMaking(true); }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left font-bold text-teal hover:bg-paper">
            <span className="w-4">+</span>New font
          </button>
          <button type="button" role="menuitem" data-testid="open-project-menu" onClick={() => file.current?.click()} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left font-medium hover:bg-paper"><span className="w-4" />Open a project file</button>
          <input ref={file} type="file" accept=".myakuru,application/json" className="sr-only" data-testid="project-file-menu" aria-label="Open a project file" onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = ""; }} />
          {note && <p role="status" data-testid="project-note" className="mx-2 rounded-lg bg-[#F3F9F5] px-3 py-2 text-xs leading-snug">{note}</p>}
          <Link href="/handwriting/fonts" role="menuitem" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 font-medium hover:bg-paper"><span className="w-4" />Manage my fonts</Link>
          <p className="flex items-center gap-2 px-3 pb-1 pt-2 text-xs text-muted"><span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser</p>
        </div>
      )}
      {making && <NewFontDialog onClose={() => setMaking(false)} />}
    </div>
  );
}
