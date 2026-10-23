"use client";

import { useState } from "react";
import { ALPHABET_FIRST_PAGE_ID, ALPHABET_PAGES } from "@/lib/handwriting/alphabet";
import { scanAlphabetSheet } from "@/lib/handwriting/alphabetscan";
import { makeAlphabetPdf, saveBlob } from "@/lib/handwriting/joinedpdf";
import type { Glyph } from "@/lib/handwriting/types";

/** Print the A to Z and a to z sheets, and read a photo of one back. Used on the Photo page. */
export function AlphabetSheetTools({ onScanned }: { onScanned: (glyphs: Glyph[]) => void }) {
  const [sheet, setSheet] = useState(ALPHABET_FIRST_PAGE_ID);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function download() {
    setBusy(true); setMsg(null);
    try {
      saveBlob(await makeAlphabetPdf(ALPHABET_PAGES), "thaanafont-alphabet.pdf");
    } catch (e) {
      setMsg("I could not make the PDF. Try again.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function read(file: File | undefined) {
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const r = await scanAlphabetSheet(file, sheet);
      if (!r.ok) { setMsg(r.reason); return; }
      if (r.glyphs.length) onScanned(r.glyphs);
      setMsg(r.message);
    } catch (e) {
      setMsg("I could not read that photo. Try a different one.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  const btn = "flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-center text-[15px] font-bold leading-tight";
  return (
    <div className="flex flex-col gap-2" data-testid="alphabet-sheet">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={download} disabled={busy} data-testid="alphabet-pdf" className={`${btn} bg-teal text-white hover:bg-teal-dark disabled:opacity-60`}>Download the sheets (PDF)</button>
        <label className="flex items-center gap-2 text-sm">
          Photo is of
          <select value={sheet} onChange={(e) => setSheet(Number(e.target.value))} data-testid="alphabet-sheet-no" className="rounded-lg border border-[#BDCFC2] bg-white px-2 py-1 text-sm">
            {ALPHABET_PAGES.map((p, i) => <option key={p.id} value={p.id}>Sheet {i + 1} · {i === 0 ? "A to Z" : "a to z"}</option>)}
          </select>
        </label>
        <label htmlFor="alphabet-photo" className={`${btn} cursor-pointer border border-[#BDCFC2] bg-white hover:bg-paper`}>{busy ? "Reading your photo…" : "Add a photo of a sheet"}</label>
        <input id="alphabet-photo" data-testid="alphabet-photo" type="file" accept="image/*" className="sr-only" onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {msg && <p role="status" data-testid="alphabet-msg" className="rounded-xl border border-line bg-white px-3 py-2 text-[13px] leading-snug text-muted">{msg}</p>}
    </div>
  );
}
