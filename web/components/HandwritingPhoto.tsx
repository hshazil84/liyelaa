"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GlyphTile } from "@/components/GlyphTile";
import { FontSwitcher } from "@/components/FontSwitcher";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import { layout, processPhoto, type PhotoOutcome } from "@/lib/handwriting/pipeline";
import { stepIndex, useSteps } from "@/lib/handwriting/steps";
import { JoinedSheetTools } from "@/components/JoinedSheetTools";
import { MixPrompt } from "@/components/MixPrompt";
import type { Ligature } from "@/lib/handwriting/extras";
import { clearProject, createFont, fontTitle, loadProject, saveGlyphs, saveLigatures, sourceMix } from "@/lib/handwriting/store";


const letterCount = layout.sheets[0].cells.length;
const filiCount = layout.sheets[1].cells.filter((c) => c.kind === "fili").length;

export function HandwritingPhoto() {
  const steps = useSteps();
  const [sheet, setSheet] = useState<1 | 2>(1);
  const [ask, setAsk] = useState<{ font: string; have: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PhotoOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ letters: number; fili: number; symbols: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const [ligs, setLigs] = useState<Ligature[]>([]);

  const refresh = useCallback(async () => {
    const p = await loadProject();
    const gs = Object.values(p.glyphs);
    setLigs(p.ligatures ?? []);
    setSaved({
      letters: gs.filter((g) => g.kind === "letter").length,
      fili: gs.filter((g) => g.kind === "fili").length,
      symbols: gs.filter((g) => g.kind === "symbol").length,
    });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await processPhoto(file, sheet);
      if (!r.ok) setError(r.reason); else setResult(r);
    } catch (e) {
      setError("I could not read that photo. Try a different one.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function saveLetters(inNewFont: boolean) {
    if (!result || !result.ok) return;
    setAsk(null);
    if (inNewFont) await createFont("Photo letters", "photo");
    await saveGlyphs(result.cells.flatMap((c) => (c.glyph ? [c.glyph] : [])));
    await refresh();
    setResult(null);
  }

  // drawn or imported letters are already in this font: ask before putting traced ones beside them
  async function useLetters() {
    if (!result || !result.ok) return;
    const p = await loadProject();
    const mix = sourceMix(p);
    if (mix.drawn > 0) { setAsk({ font: fontTitle(p), have: mix.drawn }); return; }
    await saveLetters(false);
  }

  const problems = result && result.ok ? result.cells.filter((c) => c.status === "light" || c.warn) : [];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white px-10 py-4">
        <div className="flex flex-wrap items-center gap-4"><Logo /><FontSwitcher /></div>
        <Stepper steps={steps} current={stepIndex(steps, "/handwriting", 1)} />
        <span className="hidden items-center gap-2 text-sm text-muted 2xl:flex">
          <span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1240px] flex-wrap items-start gap-6 px-10 py-8">
        <section aria-label="Get your photo in" className="flex w-full flex-col gap-5 lg:w-[360px]">
          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5">
            <h2 className="font-display text-xl font-bold">1. Print the template</h2>
            <p className="text-sm leading-normal text-muted">Two A4 pages: letters, then vowel marks, extras and numbers.</p>
            <a href="/templates/dhivehi-handwriting-template.pdf" download className="flex h-12 items-center justify-center rounded-xl border border-[#BDCFC2] text-base font-bold hover:bg-paper">
              Download the template (PDF)
            </a>
          </div>

          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5" data-testid="joined-card">
            <h2 className="font-display text-xl font-bold">Joined letters <span className="ml-1 rounded-full bg-sand px-2.5 py-0.5 align-middle font-sans text-xs font-bold">Optional</span></h2>
            {ligs.length === 0 ? (
              <>
                <p className="text-sm leading-normal text-muted">None yet. Pick the letters that join on the Joined letters step and a printable sheet appears here.</p>
                <Link href="/handwriting/ligatures" className="flex h-11 items-center justify-center rounded-xl border border-[#BDCFC2] text-[15px] font-bold hover:bg-paper">Go to joined letters</Link>
              </>
            ) : (
              <>
                <p className="text-sm leading-normal text-muted">You have {ligs.length} joined letter{ligs.length === 1 ? "" : "s"}. Download a sheet with a box for each.</p>
                <JoinedSheetTools ligs={ligs} note={false} onScanned={async (next) => { await saveLigatures(next); await refresh(); }} />
              </>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5">
            <h2 className="font-display text-xl font-bold">2. Add a photo</h2>
            <fieldset className="flex gap-2">
              <legend className="sr-only">Which sheet is it?</legend>
              {([1, 2] as const).map((n) => (
                <label key={n} className={`flex-1 cursor-pointer rounded-xl border px-3 py-2 text-center text-sm font-bold ${sheet === n ? "border-ink bg-ink text-white" : "border-[#BDCFC2] bg-white"}`}>
                  <input type="radio" name="sheet" className="sr-only" checked={sheet === n} onChange={() => setSheet(n)} />
                  {n === 1 ? "Sheet 1 · Letters" : "Sheet 2 · Marks"}
                </label>
              ))}
            </fieldset>
            <label
              htmlFor="photo"
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
              className={`flex h-36 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed px-4 text-center text-[15px] font-medium ${drag ? "border-teal bg-teal-soft" : "border-[#BDCFC2] bg-[#F3F9F5]"}`}
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#264022" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 20V6M8 12l6-6 6 6M5 23h18" />
              </svg>
              {busy ? "Reading your photo…" : "Choose a photo, or drop it here"}
            </label>
            <input id="photo" data-testid="photo-input" type="file" accept="image/*" className="sr-only" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-normal text-muted">
              <li>Use a dark marker, not pencil.</li>
              <li>Daylight, sheet flat, all four black squares in the photo.</li>
              <li>Your photo stays on this device. Only the traced letters are saved.</li>
            </ul>
          </div>

          {saved && (saved.letters + saved.fili + saved.symbols > 0) && (
            <div className="flex flex-col gap-2 rounded-3xl border border-line bg-white p-5" data-testid="saved-summary">
              <h2 className="font-display text-lg font-bold">Saved so far</h2>
              <p className="text-sm text-muted">{saved.letters} of {letterCount} letters · {saved.fili} of {filiCount} vowel marks · {saved.symbols} extras</p>
              <Link href="/handwriting/letters" data-testid="continue-letters" className="flex h-12 items-center justify-center rounded-xl bg-teal text-base font-bold text-white hover:bg-teal-dark">
                Clean up my letters
              </Link>
              <button type="button" onClick={async () => { await clearProject(); await refresh(); }} className="self-start text-sm font-bold text-teal underline underline-offset-4">
                Start again
              </button>
            </div>
          )}
        </section>

        <section aria-label="Check your photo" className="flex min-w-0 flex-[1_1_520px] flex-col gap-5 rounded-3xl border border-line bg-white p-6">
          <h1 className="font-display text-3xl font-bold leading-tight">Check your photo</h1>
          {error && <p role="alert" data-testid="photo-error" className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-medium">{error}</p>}
          {!result && !error && !busy && (
            <p className="text-base text-muted">Add a photo of a filled-in sheet and it appears here, straightened, with every letter found.</p>
          )}
          {busy && <p className="text-base text-muted" role="status">Straightening the sheet and tracing your letters…</p>}
          {result && result.ok && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <figure className="flex flex-col gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.originalUrl} alt="Your photo" className="w-full rounded-xl border border-line" />
                  <figcaption className="text-xs text-muted">Your photo</figcaption>
                </figure>
                <figure className="flex flex-col gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.straightenedUrl} alt="Straightened sheet" className="w-full rounded-xl border border-line" data-testid="straightened" />
                  <figcaption className="text-xs text-muted">Straightened</figcaption>
                </figure>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-[#F3F9F5] px-4 py-3 text-[15px]" data-testid="summary">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-teal" />{result.counts.ok} found</span>
                {result.counts.light > 0 && <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-coral" />{result.counts.light} too light</span>}
                {result.counts.edge > 0 && <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-coral" />{result.counts.edge} touching the box edge</span>}
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed border-[#BDCFC2]" />{result.counts.empty} empty</span>
              </div>
              <ul dir="rtl" className="grid grid-cols-[repeat(auto-fill,minmax(74px,1fr))] gap-2" aria-label="Letters found">
                {result.cells.map((c) => <GlyphTile key={c.id} cell={c} />)}
              </ul>
              {problems.length > 0 && (
                <p className="text-sm text-muted">
                  Look at: {problems.map((p) => p.label).join(" ")}. Write over those with a darker pen and take the photo again, or keep them and fix them in the next step.
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={useLetters} data-testid="use-letters" className="h-14 rounded-2xl bg-teal px-6 text-lg font-bold text-white hover:bg-teal-dark">
                  Use these letters
                </button>
                <button type="button" onClick={() => setResult(null)} className="h-14 rounded-2xl border border-[#BDCFC2] px-6 text-base font-bold hover:bg-paper">
                  Take a new photo
                </button>
              </div>
            </>
          )}
        </section>
      </main>
      {ask && (
        <MixPrompt fontName={ask.font} have={ask.have} haveKind="drawn" adding="letters traced from this photo"
          onAdd={() => saveLetters(false)} onNew={() => saveLetters(true)} onCancel={() => setAsk(null)} />
      )}
    </div>
  );
}
