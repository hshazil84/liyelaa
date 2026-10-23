"use client";

import Link from "next/link";
import { Upload04Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/Icon";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GlyphSvg } from "@/components/GlyphTile";
import { FontSwitcher } from "@/components/FontSwitcher";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import { ALPHABET_CELLS, withAlphabet } from "@/lib/handwriting/alphabet";
import { layout as thaanaLayout } from "@/lib/handwriting/pipeline";
import { DRAW_STEPS } from "@/lib/handwriting/steps";
import { MixPrompt } from "@/components/MixPrompt";
import { clearProject, createFont, fontTitle, loadProject, saveGlyphs, sourceMix } from "@/lib/handwriting/store";
import {
  extractSvg, idFromName, importFiles, importSheet, summarise, type ImportItem, type ImportReport, type SizeMode, type SourceFile,
} from "@/lib/handwriting/svgimport";

type Source = { kind: "letter" | "sheet"; name: string; text: string; sheetId?: number };
type Way = "letters" | "sheet";

// the template with the English alphabet pages added, so one set of rules reads every letter
const layout = withAlphabet();
const LETTERS = thaanaLayout.sheets[0].cells;
const LATIN_IDS = new Set(ALPHABET_CELLS.map((c) => c.id));
const LABEL = new Map(layout.sheets.flatMap((s) => s.cells).map((c) => [c.id, c.label] as const));
type Set_ = "thaana" | "english";

const arrowUp = <Icon icon={Upload04Icon} size={30} />;

const card = "flex min-w-0 flex-col gap-4 rounded-3xl border border-line bg-white p-5 sm:p-6";

function Label({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-extrabold text-white">{n}</span>
      <h2 className="font-display text-[19px] font-bold leading-tight">{children}</h2>
    </div>
  );
}

function Tile({ id, item, target, pickable, onPick, onRemove }: {
  id: string; item?: ImportItem; target: boolean; pickable: boolean; onPick: () => void; onRemove?: () => void;
}) {
  const cls = item?.status === "ok" ? "border-[1.5px] border-ink bg-white" : item ? "border-[1.5px] border-coral bg-white" : "border border-dashed border-[#BDCFC2] bg-[#F3F9F5]";
  const state = item?.status === "ok" ? "ok" : item ? "fix" : "missing";
  return (
    <li
      data-cell={id} data-status={state}
      title={`U+${id}${item?.reason ? ` · ${item.reason}` : ""}`}
      role={pickable ? "button" : undefined}
      tabIndex={pickable ? 0 : undefined}
      aria-label={pickable ? `Paste into U+${id}` : undefined}
      aria-pressed={pickable ? target : undefined}
      onClick={pickable ? onPick : undefined}
      onKeyDown={pickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); } } : undefined}
      className={`relative flex aspect-square min-w-0 flex-col items-center justify-center rounded-[14px] ${cls} ${pickable ? "cursor-pointer" : ""} ${target ? "outline outline-[3px] outline-offset-2 outline-coral" : ""}`}
    >
      {item?.glyph ? (
        <GlyphSvg glyph={item.glyph} className="h-full w-full p-1.5 pb-4" />
      ) : (
        LATIN_IDS.has(id)
          ? <span className={`text-[26px] font-bold leading-none ${item ? "text-plum" : "text-[#BDCFC2]"}`}>{LABEL.get(id)}</span>
          : <span lang="dv" className={`font-thaana text-[26px] leading-none ${item ? "text-plum" : "text-[#BDCFC2]"}`}>{LABEL.get(id)}</span>
      )}
      <span className={`absolute bottom-1 font-mono text-[10px] leading-none text-muted ${item?.glyph ? "" : "static mt-1"}`}>{id}</span>
      {item && onRemove && (
        <button
          type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} data-testid={`remove-${id}`} aria-label={`Remove U+${id}`} title="Take this one out"
          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[#BDCFC2] bg-white text-sm font-bold leading-none text-ink shadow-sm hover:bg-coral-soft focus-visible:ring-2 focus-visible:ring-teal"
        >×</button>
      )}
    </li>
  );
}

export function ImportClient() {
  const [way, setWay] = useState<Way>("letters");
  const [sources, setSources] = useState<Source[]>([]);
  const [mode, setMode] = useState<SizeMode>("fit");
  const [outline, setOutline] = useState(false);
  const [sheetId, setSheetId] = useState<number>(1);
  const [set, setSet] = useState<Set_>("thaana");
  const [found, setFound] = useState<ImportReport | null>(null);
  const [dropped, setDropped] = useState<string[]>([]);       // letters the person took out of the check grid
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [paste, setPaste] = useState("");
  const [picked, setPicked] = useState<string | null>(null);   // a letter chosen to paste into; otherwise the next empty one
  const [saved, setSaved] = useState<number | null>(null);
  const [existing, setExisting] = useState(0);
  const [ask, setAsk] = useState<{ font: string; have: number } | null>(null);

  const refresh = useCallback(async () => {
    const p = await loadProject();
    setExisting(Object.keys(p.glyphs).length);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Everything is worked out again from the files whenever the files or the options change.
  useEffect(() => {
    let live = true;
    (async () => {
      if (!sources.length) { setFound(null); return; }
      setBusy(true); setError(null);
      try {
        const merged: ImportReport = { items: {}, unmatched: [] };
        const letterFiles: SourceFile[] = sources.filter((s) => s.kind === "letter");
        if (letterFiles.length) {
          const r = await importFiles(letterFiles, layout, mode, outline);
          Object.assign(merged.items, r.items); merged.unmatched.push(...r.unmatched);
        }
        for (const s of sources.filter((x) => x.kind === "sheet")) {
          const r = await importSheet(s, layout, s.sheetId ?? 1, outline);
          if (r.error) { if (live) setError(`${s.name}: ${r.error}`); continue; }
          Object.assign(merged.items, r.report.items);
        }
        if (live) setFound(merged);
      } catch (e) {
        if (live) setError("I could not read those files. Try saving them again as plain SVG.");
        console.error(e);
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [sources, mode, outline]);

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list).filter((f) => /\.svg$/i.test(f.name) || f.type === "image/svg+xml");
    if (!files.length) { setError("Those are not SVG files."); return; }
    setSaved(null);
    // one file in "one sheet" mode is the sheet; otherwise a single file with no letter code is taken for one
    const oneSheet = (f: { name: string }, count: number) => count === 1 && (way === "sheet" || !idFromName(f.name));
    setDropped((d) => (oneSheet(files[0], files.length) ? [] : d.filter((id) => !files.some((f) => idFromName(f.name) === id))));
    const read = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
    setSources((prev) => {
      const next = [...prev];
      for (const f of read) {
        const s: Source = oneSheet(f, read.length) ? { kind: "sheet", name: f.name, text: f.text, sheetId } : { kind: "letter", name: f.name, text: f.text };
        const at = next.findIndex((x) => x.name === s.name);
        if (at >= 0) next[at] = s; else next.push(s);
      }
      return next;
    });
  }

  // what is shown and saved: everything found, minus what the person took out
  const report = useMemo<ImportReport | null>(() => {
    if (!found) return null;
    const items = { ...found.items };
    for (const id of dropped) delete items[id];
    return { ...found, items };
  }, [found, dropped]);

  // a paste goes to the letter picked, or the first one that has nothing yet
  const CELLS = set === "english" ? ALPHABET_CELLS : LETTERS;
  const nextEmpty = (CELLS.find((c) => !report?.items[c.id]) ?? CELLS[0]).id;
  const target = picked ?? nextEmpty;

  const addPasted = useCallback((text: string) => {
    if (!text.trim()) return;
    setSaved(null);
    if (way === "sheet") {
      const s: Source = { kind: "sheet", name: `sheet-${sheetId}.svg`, text, sheetId };
      setDropped([]);
      setSources((prev) => [...prev.filter((x) => x.name !== s.name), s]);
    } else {
      const s: Source = { kind: "letter", name: `U+${target}.svg`, text };
      setDropped((d) => d.filter((id) => id !== target));
      setSources((prev) => [...prev.filter((x) => x.name !== s.name), s]);
    }
    setPaste("");
    setPicked(null);
  }, [way, sheetId, target]);

  // Ctrl or ⌘ V anywhere on the page brings in what was copied
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const dt = e.clipboardData;
      const text = dt ? dt.getData("image/svg+xml") || dt.getData("text/plain") || dt.getData("text/html") : "";
      e.preventDefault();
      if (!extractSvg(text)) {
        setError("That is not SVG. In Illustrator, turn on Preferences, Clipboard Handling, Include SVG Code, then copy again.");
        return;
      }
      setError(null);
      addPasted(extractSvg(text)!);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addPasted]);

  const summary = useMemo(() => (report ? summarise(report, layout) : null), [report]);
  const fixes = report ? [...LETTERS, ...ALPHABET_CELLS].filter((c) => report.items[c.id]?.status === "fix") : [];
  const englishFix = report ? ALPHABET_CELLS.filter((c) => report.items[c.id]?.status === "fix").length : 0;
  const englishOk = report ? ALPHABET_CELLS.filter((c) => report.items[c.id]?.status === "ok").length : 0;
  const strokeFixes = fixes.filter((c) => report!.items[c.id]?.strokes);
  const otherFixes = fixes.filter((c) => !report!.items[c.id]?.strokes);
  const usable = report ? Object.values(report.items).filter((i) => i.status === "ok" && i.glyph) : [];

  async function save(inNewFont: boolean) {
    setAsk(null);
    if (inNewFont) await createFont("Drawn letters", "draw");
    await saveGlyphs(usable.map((i) => i.glyph!), "drawn");
    setSaved(usable.length);
    await refresh();
  }

  // letters traced from a photo are already in this font: ask before putting drawn ones beside them
  async function useThem() {
    const p = await loadProject();
    const mix = sourceMix(p);
    if (mix.photo > 0) { setAsk({ font: fontTitle(p), have: mix.photo }); return; }
    await save(false);
  }

  const total = CELLS.length;
  const matched = set === "english" ? englishOk : summary?.letters.ok ?? 0;
  const targetLabel = LABEL.get(target);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="z-30 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white lg:sticky lg:top-0 px-4 py-4 sm:px-10">
        <div className="flex flex-wrap items-center gap-4"><Logo /><FontSwitcher /></div>
        <Stepper steps={DRAW_STEPS} current={1} />
        <span className="flex items-center gap-4 text-sm text-muted">
          <span className="hidden items-center gap-2 2xl:flex"><span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser</span>
          <button type="button" onClick={async () => { await clearProject(); setSources([]); setSaved(null); await refresh(); }} className="font-bold text-ink">Start over</button>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[980px] flex-1 flex-col gap-5 px-4 py-6 sm:px-10 sm:py-8">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[28px] font-bold leading-tight sm:text-3xl">Bring in your artwork</h1>
          <p className="text-base text-muted">Letters you drew in Illustrator or another vector app.</p>
        </div>

        {error && <p role="alert" data-testid="import-error" className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-medium">{error}</p>}

        <section aria-label="How is your artwork saved" className={card}>
          <Label n={1}>How is your artwork saved?</Label>
          <div role="radiogroup" aria-label="How is your artwork saved" className="grid gap-2.5 sm:grid-cols-2">
            {([
              ["letters", "Letter by letter", "One file per letter, or copy from Illustrator and paste into a letter"],
              ["sheet", "One sheet with all the letters", "Laid out in the same order as our template"],
            ] as const).map(([id, title, text]) => (
              <button
                key={id} type="button" role="radio" aria-checked={way === id} data-testid={`way-${id}`} onClick={() => { setWay(id); setPicked(null); }}
                className={`flex min-h-[76px] flex-col gap-1 rounded-2xl border-[1.5px] p-3.5 text-left ${way === id ? "border-ink bg-teal-soft" : "border-[#BDCFC2] bg-white hover:bg-paper"}`}
              >
                <b className="text-[15px]">{title}</b>
                <span className="text-[13.5px] leading-snug text-muted">{text}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Add your artwork" className={card}>
          <Label n={2}>{way === "sheet" ? "Add your sheet" : "Add your files"}</Label>
          {way === "sheet" && (
            <div role="group" aria-label="Which page" className="flex flex-wrap gap-2">
              {([[1, "Page 1 · Letters"], [2, "Page 2 · Marks"], [91, "Page 3 · A to Z"], [92, "Page 4 · a to z"]] as const).map(([n, label]) => (
                <button key={n} type="button" aria-pressed={sheetId === n} onClick={() => setSheetId(n)} data-testid={`sheet-${n}`}
                  className={`min-h-10 flex-1 basis-[140px] rounded-xl border-[1.5px] px-4 text-sm font-bold ${sheetId === n ? "border-ink bg-ink text-white" : "border-[#BDCFC2] bg-white hover:bg-paper"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <label
            htmlFor="svg-files"
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            className={`flex min-h-[150px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed px-5 py-5 text-center ${drag ? "border-teal bg-teal-soft" : "border-[#BDCFC2] bg-[#F3F9F5]"}`}
          >
            {arrowUp}
            <b className="text-base">{busy ? "Reading your files…" : way === "sheet" ? "Drop your sheet here" : "Drop your SVG files here"}</b>
            <span className="max-w-[46ch] text-sm leading-snug text-muted">
              {way === "sheet"
                ? "One SVG with all the letters in template order."
                : "Name each file with the code under its letter below, like U+0780.svg. English letters can be upper-A.svg or lower-a.svg."}
            </span>
            <span className="mt-1.5 inline-flex h-11 items-center rounded-[14px] border-[1.5px] border-[#BDCFC2] bg-white px-5 text-[15px] font-bold">{way === "sheet" ? "Choose a file" : "Choose files"}</span>
          </label>
          <input id="svg-files" data-testid="svg-input" type="file" accept=".svg,image/svg+xml" multiple={way === "letters"} className="sr-only"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />

          <div className="flex flex-col divide-y divide-line">
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[14.5px] font-bold [&::-webkit-details-marker]:hidden">
                How do I export from Illustrator?<span aria-hidden className="text-lg text-muted group-open:hidden">+</span><span aria-hidden className="hidden text-lg text-muted group-open:inline">–</span>
              </summary>
              <ol className="mb-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-normal text-muted">
                <li>Convert your text to outlines.</li>
                <li>Choose File, then Export, then SVG. Or copy the drawing.</li>
                <li>Pasting needs Preferences, Clipboard Handling, Include SVG Code switched on.</li>
              </ol>
            </details>
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[14.5px] font-bold [&::-webkit-details-marker]:hidden">
                More options<span aria-hidden className="text-lg text-muted group-open:hidden">+</span><span aria-hidden className="hidden text-lg text-muted group-open:inline">–</span>
              </summary>
              <fieldset className="mb-3 flex flex-col gap-2.5">
                <legend className="sr-only">Size</legend>
                {([
                  ["fit", "Keep the size from our template", "Recommended if you used the template file."],
                  ["em", "My artboard is 1000 × 1000 units", "Pick this if you drew on your own square artboard."],
                ] as const).map(([id, title, text]) => (
                  <label key={id} className="flex cursor-pointer items-start gap-2.5 text-[14.5px]">
                    <input type="radio" name="size" checked={mode === id} onChange={() => setMode(id)} className="mt-1 h-[18px] w-[18px] accent-teal" />
                    <span>{title}<small className="block text-[13px] text-muted">{text}</small></span>
                  </label>
                ))}
              </fieldset>
            </details>
          </div>
        </section>

        <section aria-label="Your letters" className={card}>
          <Label n={3}>Your letters</Label>
          <div className="flex flex-col gap-2">
            <div className="h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={matched}>
              <div className="h-full rounded-full bg-ink" style={{ width: `${(matched / total) * 100}%` }} />
            </div>
            <p className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[14.5px]" data-testid="import-summary">
              {set === "english" ? (
                <>
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-ink" />{englishOk} of {ALPHABET_CELLS.length} English letters matched</span>
                  {englishFix > 0 && <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-coral" />{englishFix} need a fix</span>}
                </>
              ) : summary ? (
                <>
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-ink" />{summary.letters.ok} of {summary.letters.total} letters matched</span>
                  {summary.letters.fix > 0 && <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-coral" />{summary.letters.fix} need a fix</span>}
                  {summary.letters.missing > 0 && <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-[#BDCFC2]" />{summary.letters.missing} missing</span>}
                  {(summary.marks.ok > 0 || summary.extras.ok > 0) && <span className="text-muted">{summary.marks.ok} of {summary.marks.total} vowel marks · {summary.extras.ok} extras</span>}
                </>
              ) : (
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-[#BDCFC2]" />0 of {total} letters added</span>
              )}
            </p>
          </div>

          <div className="rounded-[14px] bg-lilac-soft px-3.5 py-3 text-[14.5px] leading-snug" data-testid="paste-tip">
            {way === "sheet" ? (
              <b>Press Ctrl or ⌘ V to paste the whole {sheetId > 90 ? "English" : `page ${sheetId}`} sheet. Or drop the file above.</b>
            ) : (
              <>
                <b>Or paste from Illustrator.</b> Copy a letter, then press Ctrl or ⌘ V. It goes into{" "}
                <b>{set === "english" ? <span className="text-lg">{targetLabel}</span> : <span lang="dv" className="font-thaana text-lg">{targetLabel}</span>} · U+{target}</b>
                {picked ? "." : ", the next empty one. Click another letter to choose it."}
                <details className="group mt-1.5">
                  <summary className="flex min-h-9 cursor-pointer list-none items-center font-bold underline underline-offset-4 [&::-webkit-details-marker]:hidden">Paste SVG code instead</summary>
                  <div className="flex flex-col gap-2.5 pb-1.5 pt-1">
                    <textarea data-testid="paste-text" value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} spellCheck={false}
                      aria-label="SVG code" placeholder="<svg …>…</svg>" className="rounded-xl border border-[#BDCFC2] bg-white p-3 font-mono text-[13px] text-ink" />
                    <button type="button" data-testid="paste-add" onClick={() => addPasted(paste)} disabled={!paste.trim()}
                      className="h-11 rounded-xl border border-[#BDCFC2] bg-white text-sm font-bold hover:bg-paper disabled:opacity-50">Add to this letter</button>
                  </div>
                </details>
              </>
            )}
            {way === "sheet" && (
              <details className="group mt-1.5">
                <summary className="flex min-h-9 cursor-pointer list-none items-center font-bold underline underline-offset-4 [&::-webkit-details-marker]:hidden">Paste SVG code instead</summary>
                <div className="flex flex-col gap-2.5 pb-1.5 pt-1">
                  <textarea data-testid="paste-text" value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} spellCheck={false}
                    aria-label="SVG code" placeholder="<svg …>…</svg>" className="rounded-xl border border-[#BDCFC2] bg-white p-3 font-mono text-[13px] text-ink" />
                  <button type="button" data-testid="paste-add" onClick={() => addPasted(paste)} disabled={!paste.trim()}
                    className="h-11 rounded-xl border border-[#BDCFC2] bg-white text-sm font-bold hover:bg-paper disabled:opacity-50">Add this sheet</button>
                </div>
              </details>
            )}
          </div>

          <div role="tablist" aria-label="Which letters" className="flex gap-2">
            {([["thaana", "Thaana letters"], ["english", "English letters"]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={set === id} data-testid={`set-${id}`} onClick={() => { setSet(id); setPicked(null); }}
                className={`min-h-10 rounded-xl border-[1.5px] px-4 text-sm font-bold ${set === id ? "border-ink bg-ink text-white" : "border-[#BDCFC2] bg-white hover:bg-paper"}`}>
                {label}{id === "english" && englishOk > 0 ? ` · ${englishOk}` : ""}
              </button>
            ))}
          </div>

          <ul aria-label="Letters" className="grid grid-cols-[repeat(auto-fill,minmax(62px,1fr))] gap-2" data-testid="check-grid">
            {CELLS.map((c) => (
              <Tile
                key={c.id} id={c.id} item={report?.items[c.id]}
                pickable={way === "letters"} target={way === "letters" && target === c.id}
                onPick={() => setPicked((p) => (p === c.id ? null : c.id))}
                onRemove={() => { setSaved(null); setDropped((d) => [...d, c.id]); }}
              />
            ))}
          </ul>

          {report && (
            <>
              {strokeFixes.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3 text-[15px]" data-testid="stroke-notice">
                  <span>
                    Strokes found in{" "}
                    {strokeFixes.map((c, i) => <span key={c.id}>{LATIN_IDS.has(c.id) ? <b>{c.label}</b> : <span lang="dv" className="font-thaana text-lg">{c.label}</span>}{i < strokeFixes.length - 1 ? " and " : ""}</span>)}
                    . Fonts need filled shapes.
                  </span>
                  <button type="button" data-testid="outline-strokes" onClick={() => setOutline(true)}
                    className="h-10 rounded-xl border border-[#BDCFC2] bg-white px-4 text-sm font-bold hover:bg-paper">Outline strokes for me</button>
                </div>
              )}
              {otherFixes.map((c) => (
                <p key={c.id} className="rounded-xl bg-paper px-4 py-3 text-[15px]">
                  {LATIN_IDS.has(c.id) ? <b>{c.label}</b> : <span lang="dv" className="font-thaana text-lg">{c.label}</span>} · {report.items[c.id]!.reason}
                </p>
              ))}
              {report.unmatched.length > 0 && (
                <p className="rounded-xl bg-paper px-4 py-3 text-[15px]" data-testid="unmatched">
                  Not a letter code, so left out: {report.unmatched.join(", ")}. Name each file like U+0780.svg.
                </p>
              )}
              {set === "thaana" && summary && summary.letters.missing > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3 text-[15px]">
                  <span>{summary.letters.missing} letter{summary.letters.missing === 1 ? " is" : "s are"} missing. Add them later, or draw them.</span>
                  <Link href="/draw/start" className="flex h-10 items-center rounded-xl border border-[#BDCFC2] bg-white px-4 text-sm font-bold hover:bg-paper">Draw them</Link>
                </div>
              )}
            </>
          )}
        </section>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-[18px] border border-line bg-white py-3 pl-4 pr-20 min-[1140px]:pr-4 shadow-[0_-4px_18px_rgba(0,0,0,0.08)]">
          {saved === null ? (
            <>
              <p className="text-[14.5px] text-muted">
                {usable.length ? "Ready. Missing letters can be added or drawn later." : existing > 0 ? `You already have ${existing} shapes saved in this browser. Add some artwork to bring in more.` : "Add some artwork to start."}
              </p>
              <button type="button" data-testid="use-letters" onClick={useThem} disabled={!usable.length}
                className="h-12 rounded-xl bg-teal px-6 text-base font-bold text-white hover:bg-teal-dark disabled:opacity-50">
                Use {usable.length} {usable.length === 1 ? "shape" : "shapes"}
              </button>
            </>
          ) : (
            <>
              <span role="status" data-testid="import-saved" className="text-[15px] font-medium">Saved {saved} {saved === 1 ? "shape" : "shapes"} in this browser.</span>
              <Link href="/handwriting/letters" data-testid="continue-letters" className="flex h-12 items-center rounded-xl bg-teal px-6 text-base font-bold text-white hover:bg-teal-dark">Open my letters</Link>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-[18px] border-[1.5px] border-dashed border-[#BDCFC2] px-4 py-3.5">
          <p className="text-[14.5px] text-muted"><b className="text-ink">No artwork yet?</b> Open a blank letter and draw it with the pen.</p>
          <Link href="/draw/start" data-testid="open-blank"
            className="flex h-11 items-center rounded-xl border-[1.5px] border-[#BDCFC2] bg-white px-5 text-[15px] font-bold hover:bg-paper">
            Open a blank letter
          </Link>
        </div>
      </main>
      {ask && (
        <MixPrompt fontName={ask.font} have={ask.have} haveKind="photo" adding={`${usable.length} ${usable.length === 1 ? "shape" : "shapes"}`}
          onAdd={() => save(false)} onNew={() => save(true)} onCancel={() => setAsk(null)} />
      )}
    </div>
  );
}
