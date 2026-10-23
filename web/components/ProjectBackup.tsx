"use client";

import { track } from "@/lib/track";
import { useRef, useState } from "react";
import { ProjectFileIcon } from "@/components/ProjectFileIcon";
import { fontHome, go } from "@/lib/handwriting/fonts";
import { openProjectFile, saveProjectFile } from "@/lib/handwriting/projectfile";
import { listFonts, switchFont } from "@/lib/handwriting/store";

type Msg = { kind: "saved" | "opened" | "error"; text: string; id?: string };

/** Save the open font as a file, or open a saved one as a new font. */
export function ProjectBackup() {
  const [msg, setMsg] = useState<Msg | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function save() {
    try {
      const name = await saveProjectFile();
      track("backup_saved");
      setMsg({ kind: "saved", text: `${name} is in your downloads. It holds your letters, spacing and settings, not your photos.` });
    } catch { setMsg({ kind: "error", text: "I could not save the file. Try again." }); }
  }
  async function open(file: File | undefined) {
    if (!file) return;
    const r = await openProjectFile(file);
    setMsg(r.ok ? { kind: "opened", id: r.id, text: `Opened as a new font: “${r.title}”. Your other fonts were not touched.` } : { kind: "error", text: r.reason });
  }
  async function switchTo(id: string) {
    const f = (await listFonts()).find((x) => x.id === id);
    if (f && (await switchFont(id))) go(fontHome(f));
  }

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5" data-testid="project-backup">
      <div className="flex items-center gap-3">
        <ProjectFileIcon size={40} />
        <h2 className="font-display text-lg font-bold">Back up this font</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void save()} data-testid="save-project" className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-teal px-4 py-2 text-[15px] font-bold text-white hover:bg-teal-dark">Save project file</button>
        <button type="button" onClick={() => input.current?.click()} data-testid="open-project" className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[#BDCFC2] bg-white px-4 py-2 text-[15px] font-bold hover:bg-paper">Open a project file</button>
        <input ref={input} type="file" accept=".thaanafont,.myakuru,application/json" className="sr-only" data-testid="project-file" aria-label="Open a project file"
          onChange={(e) => { void open(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {msg && (
        <p role={msg.kind === "error" ? "alert" : "status"} data-testid="project-msg" className={`rounded-xl px-3 py-2.5 text-[13px] leading-snug ${msg.kind === "error" ? "bg-coral-soft font-medium" : "bg-teal-soft"}`}>
          <b>{msg.kind === "error" ? "" : msg.kind === "saved" ? "Saved. " : ""}</b>{msg.text}
          {msg.kind === "opened" && msg.id && <> <button type="button" onClick={() => void switchTo(msg.id!)} data-testid="switch-opened" className="font-bold text-teal underline underline-offset-4">Switch to it</button></>}
        </p>
      )}
      <p className="text-xs leading-snug text-muted">Clearing your browser&apos;s data deletes the fonts saved in it. Keep a file as a copy.</p>
    </div>
  );
}
