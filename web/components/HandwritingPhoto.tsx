"use client";

import Link from "next/link";
import { Upload04Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/Icon";
import { useCallback, useEffect, useState } from "react";
import { GlyphTile } from "@/components/GlyphTile";
import { Loading } from "@/components/Loading";
import { FontSwitcher } from "@/components/FontSwitcher";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import { layout, processPhoto, type PhotoOutcome } from "@/lib/handwriting/pipeline";
import { HANDWRITING_STEPS } from "@/lib/handwriting/steps";
import { AlphabetSheetTools } from "@/components/AlphabetSheetTools";
import { JoinedSheetTools } from "@/components/JoinedSheetTools";
import { MixPrompt } from "@/components/MixPrompt";
import type { Ligature } from "@/lib/handwriting/extras";
import { clearProject, createFont, fontTitle, loadProject, saveAlphabet, saveGlyphs, saveLigatures, sourceMix } from "@/lib/handwriting/store";


const letterCount = layout.sheets[0].cells.length;
const filiCount = layout.sheets[1].cells.filter((c) => c.kind === "fili").length;

export function HandwritingPhoto() {
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
  const usable = result && result.ok ? result.cells.filter((c) => c.glyph).length : 0;
  const total = saved ? saved.letters + saved.fili + saved.symbols : 0;
  const card = "flex flex-col gap-3.5 rounded-3xl border border-line bg-white p-5";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="z-30 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white lg:sticky lg:top-0 px-4 sm:px-10 py-4">
        <div className="flex flex-wrap items-center gap-4"><Logo /><FontSwitcher /></div>
        <Stepper steps={HANDWRITING_STEPS} current={1} />
        <span className="hidden items-center gap-2 text-sm text-muted 2xl:flex">
          <span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-5 py-8 sm:px-10">
        {/* top left: what this page is. top right: the first thing to do */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold leading-tight">Make a font from a photo</h1>
            <p className="mt-1 max-w-[44ch] text-base text-muted">Print the sheet, write your letters, take a photo.</p>
          </div>
          <div className="flex items-center gap-3 rounded-[18px] border border-line bg-white px-3.5 py-3">
            <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-full bg-ink text-[13px] font-extrabold text-white">1</span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold leading-tight">Print the template</h2>
              <p className="text-[13.5px] text-muted">Two A4 pages</p>
            </div>
            <a href="/templates/dhivehi-handwriting-template.pdf" download className="flex h-11 items-center whitespace-nowrap rounded-xl border-[1.5px] border-[#BDCFC2] px-4 text-[15px] font-bold hover:bg-paper">
              Download PDF
            </a>
          </div>
        </div>

        {/* the middle: the photo, where the eye lands */}
        <section aria-label="Add a photo" className={`${card} p-5 sm:p-6`}>
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-full bg-ink text-[13px] font-extrabold text-white">2</span>
            <h2 className="font-display text-xl font-bold">Add a photo</h2>
          </div>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Which sheet is it?</legend>
            {([1, 2] as const).map((n) => (
              <label key={n} className={`min-w-[150px] flex-1 cursor-pointer rounded-xl border px-3 py-2.5 text-center text-sm font-bold ${sheet === n ? "border-ink bg-ink text-white" : "border-[#BDCFC2] bg-white"}`}>
                <input type="radio" name="sheet" className="sr-only" checked={sheet === n} onChange={() => setSheet(n)} />
                {n === 1 ? "Sheet 1 · Letters" : "Sheet 2 · Marks"}
              </label>
            ))}
          </fieldset>

          {error && <p role="alert" data-testid="photo-error" className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-medium">{error}</p>}

          {busy ? (
            <Loading label="Straightening the sheet and tracing your letters…" size={200} />
          ) : !(result && result.ok) ? (
            <label
              htmlFor="photo"
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
              className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed px-5 py-5 text-center ${drag ? "border-teal bg-teal-soft" : "border-[#BDCFC2] bg-[#F3F9F5]"}`}
            >
              <Icon icon={Upload04Icon} size={32} />
              <span className="text-[17px] font-bold">Choose a photo, or drop it here</span>
              <span className="max-w-[44ch] text-sm text-muted">Dark marker, daylight, sheet flat, all four black squares in the photo.</span>
            </label>
          ) : null}
          <input id="photo" data-testid="photo-input" type="file" accept="image/*" className="sr-only" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />

          {result && result.ok && !busy && (
            <>
              <div className="grid grid-cols-2 gap-3">
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
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-[#F3F9F5] px-3.5 py-2.5 text-[15px]" data-testid="summary">
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
            </>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-1.5 rounded-[20px] bg-lilac-soft p-4 text-[14.5px]">
            <h2 className="font-bold text-grape">For a clean trace</h2>
            <ul className="flex list-disc flex-col gap-1 pl-[18px] text-muted">
              <li>Use a dark marker, not pencil.</li>
              <li>Daylight, sheet flat, all four black squares in the photo.</li>
              <li>Your photo stays on this device. Only the traced letters are saved.</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2 rounded-[20px] border border-line bg-white p-4 text-[14.5px]" data-testid="joined-card">
            <h2 className="font-bold">Joined letters <span className="ml-1.5 rounded-full bg-lilac-mid px-2.5 py-0.5 align-middle text-xs font-bold text-grape">Optional</span></h2>
            {ligs.length === 0 ? (
              <>
                <p className="text-muted">Pick letters that join and print a second sheet for them.</p>
                <Link href="/handwriting/ligatures" className="flex h-11 items-center justify-center self-start rounded-xl border-[1.5px] border-[#BDCFC2] px-4 text-[15px] font-bold hover:bg-paper">Go to joined letters</Link>
              </>
            ) : (
              <>
                <p className="text-muted">You have {ligs.length} joined letter{ligs.length === 1 ? "" : "s"}. Download a sheet with a box for each.</p>
                <JoinedSheetTools ligs={ligs} note={false} onScanned={async (next) => { await saveLigatures(next); await refresh(); }} />
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-[20px] border border-line bg-white p-4 text-[14.5px] sm:col-span-2" data-testid="alphabet-card">
            <h2 className="font-bold">English alphabet <span className="ml-1.5 rounded-full bg-lilac-mid px-2.5 py-0.5 align-middle text-xs font-bold text-grape">Optional</span></h2>
            <p className="text-muted">Two more pages, A to Z and a to z. Print them, write the letters, add a photo of each page.</p>
            <AlphabetSheetTools onScanned={async (gs) => { await saveAlphabet(gs); await refresh(); }} />
          </div>
        </div>

        {/* bottom right: the one button that moves you on */}
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-[18px] border border-line bg-white py-3 pl-4 pr-20 shadow-[0_-4px_18px_rgba(0,0,0,.08)] min-[1140px]:pr-4">
          {result && result.ok ? (
            <p className="text-[14.5px] text-muted">{usable} letters found.{problems.length > 0 ? ` ${problems.length} need a look afterwards.` : ""}</p>
          ) : total > 0 ? (
            <p className="text-[14.5px] text-muted" data-testid="saved-summary">
              Saved {saved?.letters} of {letterCount} letters · {saved?.fili} of {filiCount} vowel marks · {saved?.symbols} extras.{" "}
              <button type="button" onClick={async () => { await clearProject(); await refresh(); }} className="font-bold text-teal underline underline-offset-4">Start again</button>
            </p>
          ) : (
            <p className="text-[14.5px] text-muted">Add a photo to start.</p>
          )}
          <div className="flex flex-wrap gap-2.5">
            {result && result.ok ? (
              <>
                <button type="button" onClick={() => setResult(null)} className="h-12 rounded-2xl border-[1.5px] border-[#BDCFC2] px-5 text-[15px] font-bold hover:bg-paper">Take a new photo</button>
                <button type="button" onClick={useLetters} data-testid="use-letters" className="h-12 rounded-2xl bg-teal px-6 text-base font-bold text-white hover:bg-teal-dark">Use {usable} letters</button>
              </>
            ) : total > 0 ? (
              <Link href="/handwriting/letters" data-testid="continue-letters" className="flex h-12 items-center rounded-2xl bg-teal px-6 text-base font-bold text-white hover:bg-teal-dark">Clean up my letters →</Link>
            ) : (
              <button type="button" disabled className="h-12 rounded-2xl bg-teal px-6 text-base font-bold text-white opacity-50">Use 0 letters</button>
            )}
          </div>
        </div>
      </main>
      {ask && (
        <MixPrompt fontName={ask.font} have={ask.have} haveKind="drawn" adding="letters traced from this photo"
          onAdd={() => saveLetters(false)} onNew={() => saveLetters(true)} onCancel={() => setAsk(null)} />
      )}
    </div>
  );
}
