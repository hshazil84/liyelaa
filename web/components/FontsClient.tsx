"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { NewFontDialog } from "@/components/NewFontDialog";
import { fontHome, go } from "@/lib/handwriting/fonts";
import { deleteFont, exportFont, importFont, listFonts, renameFont, switchFont, type FontMeta } from "@/lib/handwriting/store";

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
}

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FontsClient() {
  const [fonts, setFonts] = useState<FontMeta[] | null>(null);
  const [making, setMaking] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<FontMeta | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => setFonts(await listFonts()), []);
  useEffect(() => { refresh(); }, [refresh]);

  async function open(f: FontMeta) {
    if (f.active || (await switchFont(f.id))) go(fontHome(f));
  }
  async function backup(f: FontMeta) {
    const out = await exportFont(f.id);
    if (!out) { setMessage("I could not read that font."); return; }
    download(out.text, out.filename);
    setMessage(`Saved a backup of ${f.title}.`);
  }
  async function rename(f: FontMeta) {
    await renameFont(f.id, draft);
    setRenaming(null);
    await refresh();
  }
  async function remove(f: FontMeta) {
    await deleteFont(f.id);
    setDeleting(null);
    setMessage(`Deleted ${f.title}.`);
    await refresh();
  }
  async function openBackup(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const r = await importFont(await f.text());
    if (!r.ok) { setMessage(r.reason); return; }
    const now = (await listFonts()).find((x) => x.active);
    go(now ? fontHome(now) : "/handwriting/letters");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="z-30 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white lg:sticky lg:top-0 px-10 py-4">
        <Logo />
        <span className="flex items-center gap-2 text-sm text-muted"><span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser</span>
      </header>
      <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-10 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-4xl font-bold leading-tight">My fonts</h1>
          <button type="button" data-testid="new-font-page" onClick={() => setMaking(true)} className="h-12 rounded-xl bg-teal px-5 text-base font-bold text-white hover:bg-teal-dark">+ New font</button>
        </div>
        {message && (
          <p role="status" data-testid="fonts-message" className="flex items-start justify-between gap-3 rounded-xl bg-sand px-4 py-3 text-sm font-medium">
            <span>{message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setMessage(null)} className="font-bold">×</button>
          </p>
        )}
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]" data-testid="font-cards">
          {(fonts ?? []).map((f) => (
            <li key={f.id} data-font={f.id} data-active={f.active} className={`flex min-w-0 flex-col gap-3.5 rounded-[20px] bg-white p-4 ${f.active ? "border-[1.5px] border-edge" : "border border-line"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {renaming === f.id ? (
                    <form onSubmit={(e) => { e.preventDefault(); rename(f); }} className="flex gap-2">
                      <input aria-label="Font name" data-testid="rename-input" autoFocus value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null); }}
                        className="h-10 min-w-0 flex-1 rounded-lg border border-[#BDCFC2] px-3 font-bold" />
                      <button type="submit" className="h-10 rounded-lg bg-teal px-3 text-sm font-bold text-white">Save</button>
                    </form>
                  ) : (
                    <h2 className="truncate font-display text-lg font-bold">{f.title}</h2>
                  )}
                  <p className="text-[13px] text-muted">{f.active ? "Open now · " : ""}Edited {ago(f.updatedAt)}</p>
                </div>
                <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${f.path === "photo" ? "bg-teal-soft text-teal" : "bg-sand text-ink"}`}>{f.path === "photo" ? "Photo" : "Drawn"}</span>
              </div>
              <div>
                <p className="mb-1.5 text-[13px] text-muted">{f.count} of 38 letters</p>
                <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-teal" style={{ width: `${Math.round((f.count / 38) * 100)}%` }} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" data-testid={`open-${f.id}`} onClick={() => open(f)} className="h-9 rounded-lg bg-teal px-3.5 text-sm font-bold text-white hover:bg-teal-dark">Open</button>
                <button type="button" data-testid={`rename-${f.id}`} onClick={() => { setRenaming(f.id); setDraft(f.title); }} className="h-9 rounded-lg border border-[#BDCFC2] px-3 text-sm font-bold hover:bg-paper">Rename</button>
                <button type="button" onClick={() => backup(f)} className="h-9 rounded-lg border border-[#BDCFC2] px-3 text-sm font-bold hover:bg-paper">Save a backup</button>
                <button type="button" data-testid={`delete-${f.id}`} onClick={() => setDeleting(f)} className="ml-auto text-sm font-bold text-plum underline underline-offset-4">Delete</button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4 text-sm text-muted">
          <span>Your fonts live in this browser only.</span>
          <button type="button" onClick={() => file.current?.click()} className="font-bold text-teal underline underline-offset-4">Open a backup file</button>
          <input ref={file} data-testid="backup-input" type="file" accept=".thaanafont,.myakuru,application/json" className="sr-only" onChange={(e) => { openBackup(e.target.files); e.target.value = ""; }} />
        </div>
      </main>

      {making && <NewFontDialog onClose={() => setMaking(false)} />}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleting(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="del-title" data-testid="delete-dialog" className="flex w-full max-w-[460px] flex-col gap-4 rounded-3xl bg-white p-6 shadow-xl">
            <h2 id="del-title" className="font-display text-xl font-bold">Delete “{deleting.title}”?</h2>
            <p className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-medium">This cannot be undone. {deleting.count > 0 ? `The ${deleting.count} letters in it will be gone.` : "It has no letters yet."}</p>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={() => backup(deleting)} className="h-11 rounded-xl border border-[#BDCFC2] px-4 text-sm font-bold hover:bg-paper">Save a backup first</button>
              <button type="button" data-testid="confirm-delete" onClick={() => remove(deleting)} className="h-11 rounded-xl bg-plum px-4 text-sm font-bold text-white">Delete font</button>
              <button type="button" onClick={() => setDeleting(null)} className="h-11 rounded-xl border border-[#BDCFC2] px-4 text-sm font-bold hover:bg-paper">Keep it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
