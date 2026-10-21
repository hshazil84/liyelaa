"use client";

import { useState } from "react";
import type { Ligature } from "@/lib/handwriting/extras";
import { FIRST_PAGE_ID, PER_PAGE } from "@/lib/handwriting/joined";
import { scanJoinedSheet } from "@/lib/handwriting/joinedscan";
import { makeJoinedPdf, saveBlob } from "@/lib/handwriting/joinedpdf";

/** Print a sheet for the joined letters, and read a photo of it back. Used on the Joined letters page and the Photo page. */
export function JoinedSheetTools({ ligs, onScanned, note = true }: { ligs: Ligature[]; onScanned: (changed: Ligature[]) => void; note?: boolean }) {
  const [sheetNo, setSheetNo] = useState(FIRST_PAGE_ID);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const none = ligs.length === 0;
  const pages = Math.max(1, Math.ceil(ligs.length / PER_PAGE));
  const sheet = Math.min(sheetNo, FIRST_PAGE_ID + pages - 1);

  async function download() {
    setBusy(true); setMsg(null);
    try {
      saveBlob(await makeJoinedPdf(ligs), "myakuru-joined-letters.pdf");
    } catch (e) {
      setMsg("I could not make the PDF. Try again.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function read(file: File | undefined) {
    if (!file || none) return;
    setBusy(true); setMsg(null);
    try {
      const r = await scanJoinedSheet(file, ligs, sheet);
      if (!r.ok) { setMsg(r.reason); return; }
      if (r.changed.length) onScanned(r.changed);
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
    <div className="flex flex-col gap-2" data-testid="paper-sheet">
      {none ? (
        <button type="button" disabled className={`${btn} bg-teal text-white opacity-40`}>Download the sheet (PDF)</button>
      ) : (
        <button type="button" onClick={download} disabled={busy} data-testid="print-sheet" className={`${btn} bg-teal text-white hover:bg-teal-dark disabled:opacity-60`}>
          Download the sheet (PDF)
        </button>
      )}
      {pages > 1 && (
        <label className="flex items-center gap-2 text-sm">
          Photo is of
          <select value={sheet} onChange={(e) => setSheetNo(Number(e.target.value))} data-testid="sheet-no" className="rounded-lg border border-[#BDCFC2] bg-white px-2 py-1 text-sm">
            {Array.from({ length: pages }, (_, i) => <option key={i} value={FIRST_PAGE_ID + i}>Sheet {FIRST_PAGE_ID + i}</option>)}
          </select>
        </label>
      )}
      <label htmlFor="sheet-photo" className={`${btn} border border-[#BDCFC2] bg-white ${none ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-paper"}`}>
        {busy ? "Reading your photo…" : "Add a photo of the sheet"}
      </label>
      <input id="sheet-photo" data-testid="sheet-photo" type="file" accept="image/*" disabled={none} className="sr-only" onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} />
      {msg ? (
        <p role="status" data-testid="sheet-msg" className="rounded-xl border border-line bg-white px-3 py-2 text-[13px] leading-snug text-muted">{msg}</p>
      ) : note && (
        <p className="rounded-xl border border-line bg-white px-3 py-2 text-[13px] leading-snug text-muted">
          {none ? "Add joined letters to print a sheet." : `Downloads ${pages === 1 ? "1 page, sheet 3" : `${pages} pages, sheets 3 to ${FIRST_PAGE_ID + pages - 1}`}. Print it, write them, photograph the page, then add the photo.`}
        </p>
      )}
    </div>
  );
}
