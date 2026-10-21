"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GlyphSvg } from "@/components/GlyphTile";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import { layout } from "@/lib/handwriting/pipeline";
import { DRAW_STEPS } from "@/lib/handwriting/steps";
import { clearProject, loadProject, saveGlyphs, setPath } from "@/lib/handwriting/store";
import {
  extractSvg, idFromName, importFiles, importSheet, summarise, type ImportItem, type ImportReport, type SizeMode, type SourceFile,
} from "@/lib/handwriting/svgimport";

type Source = { kind: "letter" | "sheet"; name: string; text: string; sheetId?: number };

const LETTERS = layout.sheets[0].cells;
const LABEL = new Map(layout.sheets.flatMap((s) => s.cells).map((c) => [c.id, c.label] as const));
const PICK = layout.sheets.flatMap((s) => s.cells).map((c) => ({ id: c.id, label: `${c.label}  U+${c.id}`, kind: c.kind }));

const arrowUp = (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#10211F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 20V6M8 12l6-6 6 6M5 23h18" />
  </svg>
);

function Tile({ id, item, onRemove }: { id: string; item?: ImportItem; onRemove?: () => void }) {
  const cls = item?.status === "ok" ? "border-2 border-teal bg-white" : item ? "border-2 border-coral bg-white" : "border border-dashed border-[#B6C2BF] bg-[#F3F6F5]";
  const state = item?.status === "ok" ? "ok" : item ? "fix" : "missing";
  return (
    <li
      data-cell={id} data-status={state}
      title={`U+${id}${item?.reason ? ` · ${item.reason}` : ""}`}
      className={`group relative flex h-16 w-16 items-center justify-center rounded-[14px] ${cls}`}
    >
      {item?.glyph ? (
        <GlyphSvg glyph={item.glyph} className="h-full w-full p-1" />
      ) : (
        <span lang="dv" className={`font-thaana text-[26px] leading-none ${item ? "text-coral" : "text-[#B6C2BF]"}`}>{LABEL.get(id)}</span>
      )}
      {item && onRemove && (
        <button
          type="button" onClick={onRemove} data-testid={`remove-${id}`} aria-label={`Remove U+${id}`} title="Take this one out"
          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[#B6C2BF] bg-white text-sm font-bold leading-none text-ink shadow-sm hover:bg-coral-soft focus-visible:ring-2 focus-visible:ring-teal"
        >×</button>
      )}
    </li>
  );
}

export function ImportClient() {
  const [tab, setTab] = useState<"files" | "paste">("files");
  const [sources, setSources] = useState<Source[]>([]);
  const [mode, setMode] = useState<SizeMode>("fit");
  const [outline, setOutline] = useState(false);
  const [sheetId, setSheetId] = useState<1 | 2>(1);
  const [found, setFound] = useState<ImportReport | null>(null);
  const [dropped, setDropped] = useState<string[]>([]);       // letters the person took out of the check grid
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteFor, setPasteFor] = useState("0780");
  const [saved, setSaved] = useState<number | null>(null);
  const [existing, setExisting] = useState(0);

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
    const isSheetFile = files.length === 1 && !idFromName(files[0].name);
    setDropped((d) => (isSheetFile ? [] : d.filter((id) => !files.some((f) => idFromName(f.name) === id))));
    const read = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
    setSources((prev) => {
      const next = [...prev];
      for (const f of read) {
        const isSheet = read.length === 1 && !idFromName(f.name);
        const s: Source = isSheet ? { kind: "sheet", name: f.name, text: f.text, sheetId } : { kind: "letter", name: f.name, text: f.text };
        const at = next.findIndex((x) => x.name === s.name);
        if (at >= 0) next[at] = s; else next.push(s);
      }
      return next;
    });
  }

  const addPasted = useCallback((text: string) => {
    if (!text.trim()) return;
    setSaved(null);
    setDropped((d) => (pasteFor === "sheet1" || pasteFor === "sheet2" ? [] : d.filter((id) => id !== pasteFor)));
    const s: Source = pasteFor === "sheet1" || pasteFor === "sheet2"
      ? { kind: "sheet", name: `sheet-${pasteFor.slice(5)}.svg`, text, sheetId: Number(pasteFor.slice(5)) }
      : { kind: "letter", name: `U+${pasteFor}.svg`, text };
    setSources((prev) => [...prev.filter((x) => x.name !== s.name), s]);
    setPaste("");
  }, [pasteFor]);

  // Ctrl or ⌘ V anywhere on the page brings in what was copied, for the letter chosen under Paste
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const dt = e.clipboardData;
      const text = dt ? dt.getData("image/svg+xml") || dt.getData("text/plain") || dt.getData("text/html") : "";
      e.preventDefault();
      setTab("paste");
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

  // what is shown and saved: everything found, minus what the person took out
  const report = useMemo<ImportReport | null>(() => {
    if (!found) return null;
    const items = { ...found.items };
    for (const id of dropped) delete items[id];
    return { ...found, items };
  }, [found, dropped]);
  const summary = useMemo(() => (report ? summarise(report, layout) : null), [report]);
  const fixes = report ? LETTERS.filter((c) => report.items[c.id]?.status === "fix") : [];
  const strokeFixes = fixes.filter((c) => report!.items[c.id]?.strokes);
  const otherFixes = fixes.filter((c) => !report!.items[c.id]?.strokes);
  const usable = report ? Object.values(report.items).filter((i) => i.status === "ok" && i.glyph) : [];

  async function useThem() {
    await saveGlyphs(usable.map((i) => i.glyph!), "drawn");
    setSaved(usable.length);
    await refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white px-10 py-4">
        <Logo />
        <Stepper steps={DRAW_STEPS} current={1} />
        <span className="flex items-center gap-4 text-sm text-muted">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser</span>
          <button type="button" onClick={async () => { await clearProject(); setSources([]); setSaved(null); await refresh(); }} className="font-bold text-ink">Start over</button>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1240px] flex-wrap items-start gap-6 px-10 py-8">
        <div className="flex w-full flex-col gap-5 lg:w-[360px]">
          <section aria-label="Bring in your artwork" className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5">
            <h2 className="font-display text-xl font-bold">Bring in your artwork</h2>
            <div role="tablist" aria-label="How to bring it in" className="flex gap-2">
              {([["files", "SVG files"], ["paste", "Paste"]] as const).map(([id, label]) => (
                <button
                  key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === id ? "bg-ink text-white" : "text-muted hover:bg-paper"}`}
                >{label}</button>
              ))}
            </div>

            {tab === "files" ? (
              <>
                <label
                  htmlFor="svg-files"
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
                  className={`flex h-36 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 text-center text-[15px] font-medium ${drag ? "border-teal bg-teal-soft" : "border-[#B6C2BF] bg-[#F3F6F5]"}`}
                >
                  {arrowUp}
                  {busy ? "Reading your files…" : "Drop SVG files here"}
                </label>
                <input id="svg-files" data-testid="svg-input" type="file" accept=".svg,image/svg+xml" multiple className="sr-only"
                  onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
                <p className="text-sm leading-normal text-muted">
                  Use one file per letter named by its code, like U+0780.svg, or one sheet with the letters in template order.
                </p>
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="text-[13px] text-muted">If it is one whole page, which page?</legend>
                  <div className="flex gap-2">
                    {([1, 2] as const).map((n) => (
                      <label key={n} className={`flex-1 cursor-pointer rounded-xl border px-3 py-1.5 text-center text-sm font-bold ${sheetId === n ? "border-ink bg-ink text-white" : "border-[#B6C2BF] bg-white"}`}>
                        <input type="radio" name="sheet" className="sr-only" checked={sheetId === n} onChange={() => setSheetId(n)} />
                        {n === 1 ? "Page 1 · Letters" : "Page 2 · Marks"}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                  1. What is this artwork?
                  <select data-testid="paste-for" value={pasteFor} onChange={(e) => setPasteFor(e.target.value)} className="h-11 rounded-xl border border-[#B6C2BF] bg-white px-3 text-base text-ink">
                    <option value="sheet1">The whole page 1 (letters)</option>
                    <option value="sheet2">The whole page 2 (marks and extras)</option>
                    {PICK.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
                <p className="rounded-xl bg-teal-soft px-3.5 py-3 text-[14px] leading-snug">
                  <b className="text-teal-dark">2. Copy it in Illustrator, then press Ctrl or ⌘ V on this page.</b> It is read straight from the clipboard. You can also paste the SVG code in the box.
                </p>
                <label className="flex flex-col gap-1.5 text-[13px] text-muted">
                  SVG code
                  <textarea data-testid="paste-text" value={paste} onChange={(e) => setPaste(e.target.value)} rows={7} spellCheck={false}
                    placeholder="<svg …>…</svg>" className="rounded-xl border border-[#B6C2BF] bg-white p-3 font-mono text-[13px] text-ink" />
                </label>
                <button type="button" data-testid="paste-add" onClick={() => addPasted(paste)} disabled={!paste.trim()}
                  className="h-11 rounded-xl border border-[#B6C2BF] bg-white text-sm font-bold hover:bg-paper disabled:opacity-50">Add this artwork</button>
              </div>
            )}

            <fieldset className="flex flex-col gap-1.5 border-t border-line pt-3">
              <legend className="text-[13px] text-muted">Size</legend>
              {([["fit", "Match the template size (recommended)"], ["em", "My artboard is the em square (1000 units)"]] as const).map(([id, label]) => (
                <label key={id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name="size" checked={mode === id} onChange={() => setMode(id)} className="accent-teal" />
                  {label}
                </label>
              ))}
            </fieldset>
          </section>

          <section aria-label="From Illustrator" className="flex flex-col gap-2 rounded-3xl border border-line bg-white p-5">
            <h2 className="font-display text-lg font-bold">From Illustrator</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-normal text-muted">
              <li>Convert text to outlines.</li>
              <li>Turn on Preferences, Clipboard Handling, Include SVG Code, so a copy carries SVG.</li>
              <li>Copy the drawing and press Ctrl or ⌘ V here, or on any letter in the editor.</li>
              <li>Or save as SVG and drop the file here.</li>
            </ul>
          </section>

          <section aria-label="Or draw here" className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5">
            <h2 className="font-display text-lg font-bold">Or draw here</h2>
            <div className="flex h-[120px] items-center justify-center rounded-2xl bg-paper">
              <svg aria-hidden viewBox="0 0 220 100" width="170" height="78">
                <path d="M20 70 C 60 10, 110 10, 120 50 S 170 90, 200 30" fill="none" stroke="#10211F" strokeWidth="3" strokeLinecap="round" />
                <path d="M20 70 L 55 28 M120 50 L 150 86" stroke="#D9482B" strokeWidth="1.5" fill="none" />
                {[[15, 65], [115, 45], [195, 25]].map(([x, y]) => <rect key={x} x={x} y={y} width="10" height="10" fill="#fff" stroke="#D9482B" strokeWidth="2" />)}
              </svg>
            </div>
            <p className="text-sm leading-normal text-muted">Pen tool with curve handles. Add, move, and convert points between smooth and corner.</p>
            <Link href="/handwriting/letters" data-testid="open-blank" onClick={() => setPath("draw")}
              className="flex h-12 items-center justify-center rounded-xl border border-[#B6C2BF] bg-white text-base font-bold hover:bg-paper">
              Open a blank letter
            </Link>
            <p className="text-[13px] leading-snug text-muted">In the editor you can draw with the pen, or press Ctrl or ⌘ V to paste artwork onto the letter you picked.</p>
          </section>
        </div>

        <section aria-label="Check your artwork" className="flex min-w-0 flex-[1_1_520px] flex-col gap-5 rounded-3xl border border-line bg-white p-6">
          <h1 className="font-display text-3xl font-bold leading-tight">Check your artwork</h1>
          {error && <p role="alert" data-testid="import-error" className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-medium">{error}</p>}
          {!report && !error && (
            <p className="text-base text-muted">
              {existing > 0 ? `You already have ${existing} shapes saved in this browser. ` : ""}
              Add your SVG files and every letter appears here, matched by its code.
            </p>
          )}
          {report && summary && (
            <>
              <ul aria-label="Letters" className="flex flex-wrap gap-2.5" data-testid="check-grid">
                {LETTERS.map((c) => <Tile key={c.id} id={c.id} item={report.items[c.id]} onRemove={() => { setSaved(null); setDropped((d) => [...d, c.id]); }} />)}
              </ul>
              <p className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-paper px-4 py-3 text-[15px]" data-testid="import-summary">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-teal" />{summary.letters.ok} of {summary.letters.total} letters matched</span>
                {summary.letters.fix > 0 && <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-coral" />{summary.letters.fix} need a fix</span>}
                {summary.letters.missing > 0 && <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-[#B6C2BF]" />{summary.letters.missing} missing</span>}
                {(summary.marks.ok > 0 || summary.extras.ok > 0) && <span className="text-muted">{summary.marks.ok} of {summary.marks.total} vowel marks · {summary.extras.ok} extras</span>}
              </p>

              {strokeFixes.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3 text-[15px]" data-testid="stroke-notice">
                  <span>
                    Strokes found in{" "}
                    {strokeFixes.map((c, i) => <span key={c.id}><span lang="dv" className="font-thaana text-lg">{c.label}</span>{i < strokeFixes.length - 1 ? " and " : ""}</span>)}
                    . Fonts need filled shapes.
                  </span>
                  <button type="button" data-testid="outline-strokes" onClick={() => setOutline(true)}
                    className="h-10 rounded-xl border border-[#B6C2BF] bg-white px-4 text-sm font-bold hover:bg-paper">Outline strokes for me</button>
                </div>
              )}
              {otherFixes.map((c) => (
                <p key={c.id} className="rounded-xl bg-paper px-4 py-3 text-[15px]">
                  <span lang="dv" className="font-thaana text-lg">{c.label}</span> · {report.items[c.id]!.reason}
                </p>
              ))}
              {report.unmatched.length > 0 && (
                <p className="rounded-xl bg-paper px-4 py-3 text-[15px]" data-testid="unmatched">
                  Not a letter code, so left out: {report.unmatched.join(", ")}. Name each file like U+0780.svg.
                </p>
              )}
              {summary.letters.missing > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3 text-[15px]">
                  <span>{summary.letters.missing} letter{summary.letters.missing === 1 ? " is" : "s are"} missing. Import them later or draw them.</span>
                  <Link href="/handwriting/letters" onClick={() => setPath("draw")} className="flex h-10 items-center rounded-xl border border-[#B6C2BF] bg-white px-4 text-sm font-bold hover:bg-paper">Draw them</Link>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                {saved === null ? (
                  <button type="button" data-testid="use-letters" onClick={useThem} disabled={!usable.length}
                    className="h-12 rounded-xl bg-teal px-6 text-base font-bold text-white hover:bg-teal-dark disabled:opacity-50">
                    Use {usable.length} {usable.length === 1 ? "shape" : "shapes"}
                  </button>
                ) : (
                  <>
                    <span role="status" data-testid="import-saved" className="text-[15px] font-medium">Saved {saved} {saved === 1 ? "shape" : "shapes"} in this browser.</span>
                    <Link href="/handwriting/letters" data-testid="continue-letters" className="flex h-12 items-center rounded-xl bg-teal px-6 text-base font-bold text-white hover:bg-teal-dark">Clean up my letters</Link>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
