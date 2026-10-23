"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FontSwitcher } from "@/components/FontSwitcher";
import { Logo } from "@/components/Logo";
import { ProjectBackup } from "@/components/ProjectBackup";
import { BuilderWaking, useSlow } from "@/components/BuilderWaking";
import { Stepper } from "@/components/Stepper";
import {
  DEFAULT_INFO, NEEDED_LETTERS, NEEDED_MARKS, allMine, buildHandwritingFont, buildProblem, cleanFontName, cpId, infoProblems, saveBlob,
  type BuildFormat,
} from "@/lib/handwriting/build";
import { DEFAULT_EXTRAS } from "@/lib/handwriting/extras";
import { checkPair } from "@/lib/handwriting/marks";
import { layout } from "@/lib/handwriting/pipeline";
import { stepIndex, useSteps } from "@/lib/handwriting/steps";
import { loadProject, saveInfo, type FontInfo, type Project } from "@/lib/handwriting/store";

type Tab = "headline" | "paragraph" | "pangram" | "letters";
const TABS: { id: Tab; label: string }[] = [
  { id: "headline", label: "Headline" },
  { id: "paragraph", label: "Paragraph" },
  { id: "pangram", label: "Pangram" },
  { id: "letters", label: "All letters" },
];
const HEADLINE = "މިއީ ފުރަތަމަ ފޮންޓް";
const PARAGRAPH = "ދިވެހިބަސް ދިވެހިރާއްޖެ މާލެ ފޮންޓް ".repeat(4).trim();
/** One sentence that uses most of the native letters and vowel marks, to see them together in running text. */
const PANGRAM = "ބޮޑު ބާޒާރުގައި ހުންނަ މޮޅު އެއްޗެތީގައި ސިލްޖަހަންޏާ ޕޯސްޓް އޮފީހުގެ ވެރިޔަކު ވާނީ ދާށެވެ.";
const PANGRAM_MISSING = {
  letters: Array.from({ length: 38 }, (_, i) => String.fromCodePoint(0x0780 + i)).filter((c) => !PANGRAM.includes(c)),
  marks: Array.from({ length: 11 }, (_, i) => String.fromCodePoint(0x07a6 + i)).filter((c) => !PANGRAM.includes(c)),
};
const ALL_LETTERS = layout.sheets[0].cells.filter((c) => c.kind === "letter").map((c) => c.label).join("");
const SIGNS = [{ cp: 0xfdfd, label: "Bismillah" }, { cp: 0xfdf2, label: "Allah" }, { cp: 0x20c2, label: "rufiyaa" }];

type Check = { ok: boolean; text: string; href?: string };
type Preview = "idle" | "building" | "ready" | "error";

let faceCounter = 0;

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      {children}
      {error ? <span role="alert" className="text-[12.5px] leading-snug text-plum">{error}</span>
        : hint ? <span className="text-[12.5px] leading-snug text-muted">{hint}</span> : null}
    </div>
  );
}

const inputCls = "h-11 w-full rounded-xl border border-[#BDCFC2] bg-white px-3.5 text-[15px] font-normal";

export function ExportClient() {
  const steps = useSteps();
  const [project, setProject] = useState<Project | null>(null);
  const [info, setInfo] = useState<FontInfo>(DEFAULT_INFO);
  const [tab, setTab] = useState<Tab>("headline");
  const [size, setSize] = useState(48);
  const [family, setFamily] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [filled, setFilled] = useState<string[]>([]);
  const [busy, setBusy] = useState<BuildFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<BuildFormat | null>(null);
  const slow = useSlow(busy !== null);
  const faceRef = useRef<FontFace | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadProject().then((p) => {
      setProject(p);
      setInfo({ ...DEFAULT_INFO, ...(p.title ? { name: cleanFontName(p.title).trim() || DEFAULT_INFO.name } : {}), ...(p.info ?? {}) });
    });
  }, []);

  const set = <K extends keyof FontInfo>(k: K, v: FontInfo[K]) =>
    setInfo((prev) => {
      const next = { ...prev, [k]: v };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void saveInfo(next); }, 300);
      return next;
    });

  const mine = project ? allMine(project) : false;
  // A font that is not all the person's own letters uses the open starter font, so it has to stay open source.
  const licence: FontInfo["licence"] = mine ? info.licence : "ofl";
  const effective = useMemo(() => ({ ...info, licence }), [info, licence]);
  const problems = infoProblems(info);
  const hasProblems = Object.keys(problems).length > 0;
  const hasGlyphs = !!project && Object.values(project.glyphs).some((g) => g.contours.length);

  // The preview is the real font from the builder, so what is tested is what is downloaded.
  const previewKey = project ? JSON.stringify([project.updatedAt, effective.licence, effective.name]) : "";
  useEffect(() => {
    if (!project || !hasGlyphs) return;
    const ctrl = new AbortController();
    setPreview("building");
    const timer = setTimeout(async () => {
      try {
        const r = await buildHandwritingFont(project, { ...DEFAULT_INFO, name: "Preview", licence: effective.licence }, "woff2", ctrl.signal);
        const fam = `HandPreview${++faceCounter}`;
        const face = new FontFace(fam, await r.blob.arrayBuffer());
        await face.load();
        if (ctrl.signal.aborted) return;
        document.fonts.add(face);
        if (faceRef.current) document.fonts.delete(faceRef.current);
        faceRef.current = face;
        setFamily(fam);
        setFilled(r.filled);
        setPreview("ready");
        setPreviewError(null);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setPreview("error");
        setPreviewError(buildProblem(e));
      }
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [previewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const checks = useMemo<Check[]>(() => {
    if (!project) return [];
    const have = (cp: number) => !!project.glyphs[cpId(cp)]?.contours.length;
    const out: Check[] = [];
    const nl = NEEDED_LETTERS.filter(have).length, nm = NEEDED_MARKS.filter(have).length;
    const gapNote = licence === "ofl" ? "the rest come from the starter font" : "the rest will be blank";
    out.push({ ok: nl === 38, text: nl === 38 ? "All 38 letters drawn" : `${nl} of 38 letters drawn, ${gapNote}`, href: nl === 38 ? undefined : "/handwriting/letters" });
    out.push({ ok: nm === 11, text: nm === 11 ? "All 11 vowel marks drawn" : `${nm} of 11 vowel marks drawn, ${gapNote}`, href: nm === 11 ? undefined : "/handwriting/letters" });
    let bad = 0;
    for (const lcp of NEEDED_LETTERS) for (const mcp of NEEDED_MARKS) {
      const l = project.glyphs[cpId(lcp)], m = project.glyphs[cpId(mcp)];
      if (l?.contours.length && m?.contours.length && !checkPair(l, m, project.markOffsets?.[`${l.id}|${m.id}`]).ok) bad++;
    }
    out.push({ ok: bad === 0, text: bad === 0 ? "Every vowel mark sits on its letter" : `${bad} vowel mark ${bad === 1 ? "combination looks" : "combinations look"} wrong`, href: bad ? "/handwriting/anchors" : undefined });
    const missing = SIGNS.filter((s) => !have(s.cp)).map((s) => s.label);
    out.push({ ok: missing.length === 0, text: missing.length === 0 ? "Bismillah, Allah and rufiyaa signs drawn" : `Not drawn: ${missing.join(", ")}`, href: missing.length ? "/handwriting/letters" : undefined });
    const ex = { ...DEFAULT_EXTRAS, ...project.extras };
    const marks = [0x060c, 0x061b, 0x061f].filter(have).length;
    out.push({
      ok: true,
      text: !ex.latinPunctuation && !ex.rtlQuotes
        ? "Punctuation is left as typed"
        : `${ex.latinPunctuation ? (marks === 3 ? "Comma, semicolon and question mark follow the keyboard keys" : "Comma, semicolon and question mark follow the keyboard keys once you draw them") : ""}${ex.latinPunctuation && ex.rtlQuotes ? ", " : ""}${ex.rtlQuotes ? "quotes face the right way for Thaana" : ""}`.replace(/^./, (c) => c.toUpperCase()),
      href: marks < 3 ? "/handwriting/extras" : undefined,
    });
    const joined = (project.ligatures ?? []).filter((l) => l.glyph.contours.length).length;
    if (joined) out.push({ ok: true, text: `${joined} joined ${joined === 1 ? "shape" : "shapes"} will be used` });
    return out;
  }, [project, licence]);

  async function download(format: BuildFormat) {
    if (!project) return;
    setBusy(format);
    setError(null); setFailed(null);
    try {
      const r = await buildHandwritingFont(project, effective, format);
      saveBlob(r.blob, r.filename);
    } catch (e) {
      setError(buildProblem(e)); setFailed(format);
    } finally {
      setBusy(null);
    }
  }

  const year = new Date().getFullYear();
  const designer = info.designer.trim();
  const writtenIn = [
    `© ${year} ${designer || "the designer"}`,
    `Version ${info.version.trim() || "1.000"}`,
    licence === "ofl" ? "SIL OFL 1.1" : "All rights reserved",
  ].join(" · ");
  const sample = tab === "headline" ? HEADLINE : tab === "paragraph" ? PARAGRAPH : tab === "pangram" ? PANGRAM : ALL_LETTERS;
  const fontStyle = family ? { fontFamily: `${family}, sans-serif` } : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white px-10 py-4">
        <div className="flex flex-wrap items-center gap-4"><Logo /><FontSwitcher /></div>
        <Stepper steps={steps} current={stepIndex(steps, "/handwriting/export", 7)} />
        <span className="hidden items-center gap-2 text-sm text-muted 2xl:flex">
          <span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1280px] flex-wrap items-start gap-6 px-10 py-8">
        <section aria-label="Test your font" className="flex min-w-0 flex-[1_1_520px] flex-col gap-4 rounded-3xl border border-line bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-bold">Test your font</h1>
            <div role="tablist" aria-label="Sample text" className="flex gap-1 text-sm font-medium">
              {TABS.map((t) => (
                <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                  className={`rounded-full px-3 py-1.5 ${tab === t.id ? "bg-ink text-white" : "text-muted hover:bg-paper"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <label htmlFor="size" className="font-bold">Size</label>
            <input id="size" type="range" min={16} max={160} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1" />
            <span className="w-14 text-right tabular-nums text-muted">{size} px</span>
          </div>
          {!hasGlyphs && project ? (
            <p role="status" className="rounded-xl bg-sand px-4 py-3 text-sm">
              There is nothing to test yet. <Link href="/handwriting" className="font-bold text-teal underline underline-offset-4">Add a photo of your sheet</Link> or draw your letters first.
            </p>
          ) : (
            <div
              className="relative min-h-[330px] overflow-hidden rounded-[18px] bg-sand px-8 py-7"
              data-testid="test-area"
              data-preview-state={preview}
            >
              <div lang="dv" dir="rtl" className="text-ink" style={{ ...fontStyle, fontSize: size, lineHeight: 1.7, wordBreak: "break-word" }} data-testid="test-text">
                {tab === "headline" ? <><div>{HEADLINE}</div><div style={{ fontSize: size * 0.66 }}>{PARAGRAPH.split(" ").slice(0, 3).join(" ")}</div></> : sample}
              </div>
              {tab === "pangram" && (
                <p className="mt-4 text-[13px] leading-relaxed text-muted" data-testid="pangram-coverage">
                  Uses {38 - PANGRAM_MISSING.letters.length} of 38 letters and {11 - PANGRAM_MISSING.marks.length} of 11 vowel marks. Not in this sentence:{" "}
                  <span lang="dv" dir="rtl" className="text-[22px] text-ink" style={fontStyle}>{[...PANGRAM_MISSING.letters, ...PANGRAM_MISSING.marks.map((m) => "ބ" + m)].join(" ")}</span>
                </p>
              )}
              {preview === "building" && <p role="status" className="absolute bottom-3 left-5 text-[13px] text-muted">Building your font…</p>}
              {preview === "error" && <p role="alert" className="absolute bottom-3 left-5 right-5 text-[13px] text-plum">{previewError}</p>}
            </div>
          )}
        </section>

        <aside aria-label="Export" className="flex w-full flex-col gap-4 lg:w-[380px]">
          <div className="flex flex-col gap-3.5 rounded-3xl border border-line bg-white p-5">
            <h2 className="font-display text-lg font-bold">Checks</h2>
            <ul className="flex flex-col gap-2.5" data-testid="checks">
              {checks.map((c) => (
                <li key={c.text} data-ok={c.ok} className="flex items-center gap-2.5 text-sm">
                  <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold ${c.ok ? "bg-teal text-white" : "bg-sand text-ink"}`} aria-hidden>{c.ok ? "✓" : "!"}</span>
                  <span>{c.text}</span>
                  {c.href && <Link href={c.href} className="ml-auto flex-none text-[13px] font-bold text-teal underline underline-offset-4">Fix</Link>}
                </li>
              ))}
            </ul>
          </div>

          <form className="flex flex-col gap-3.5 rounded-3xl border border-line bg-white p-5" onSubmit={(e) => e.preventDefault()} aria-label="About your font">
            <h2 className="font-display text-lg font-bold">About your font</h2>
            <Field id="font-name" label="Font name" hint="Letters, numbers, spaces and hyphens.">
              <input id="font-name" value={info.name} maxLength={40} onChange={(e) => set("name", cleanFontName(e.target.value))} className={inputCls} />
            </Field>
            <Field id="designer" label="Designer" hint="Your name goes into the font as designer and copyright holder.">
              <input id="designer" value={info.designer} maxLength={80} autoComplete="name" onChange={(e) => set("designer", e.target.value)} className={inputCls} />
            </Field>
            <Field id="website" label="Website (optional)" hint="Saved in the font so people can find you." error={problems.website}>
              <input id="website" value={info.website} maxLength={120} inputMode="url" autoComplete="url" aria-invalid={!!problems.website} onChange={(e) => set("website", e.target.value)} className={inputCls} />
            </Field>
            <Field id="description" label="Description (optional)">
              <input id="description" value={info.description} maxLength={200} onChange={(e) => set("description", e.target.value)} className={inputCls} />
            </Field>
            <div className="w-28">
              <Field id="version" label="Version" error={problems.version}>
                <input id="version" value={info.version} maxLength={7} inputMode="decimal" aria-invalid={!!problems.version} onChange={(e) => set("version", e.target.value)} className={inputCls} />
              </Field>
            </div>
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-sm font-bold">Licence</legend>
              {([
                ["ofl", "Open source (SIL Open Font License)", "Anyone may use and share your font, free or in products. Needed if letters from the starter font are used.", true],
                ["private", "Keep it private", "All rights reserved. Only possible when every letter and vowel mark is yours.", mine],
              ] as const).map(([id, title, text, enabled]) => {
                const on = licence === id;
                return (
                  <label key={id} className={`flex gap-3 rounded-[14px] p-3 text-sm ${on ? "border-[1.5px] border-edge bg-teal-soft p-[11px]" : "border border-line"} ${enabled ? "cursor-pointer" : "opacity-60"}`}>
                    <input type="radio" name="licence" value={id} checked={on} disabled={!enabled} onChange={() => set("licence", id)} className="mt-1 accent-teal" />
                    <span><b>{title}</b><span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{text}</span></span>
                  </label>
                );
              })}
            </fieldset>
            <div className="rounded-xl bg-[#F3F9F5] px-3 py-2.5 text-[12.5px] leading-relaxed text-muted" data-testid="written-in">
              <b className="text-ink">Written into the font</b><br />
              {writtenIn}
              {filled.length > 0 && licence === "ofl" && <><br />Letters not drawn: {filled.length}, from Noto Sans Thaana</>}
            </div>
          </form>

          <ProjectBackup />

          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5">
            <button
              type="button"
              disabled={busy !== null || hasProblems || !hasGlyphs}
              onClick={() => download("zip")}
              data-testid="download-zip"
              className="h-[52px] rounded-2xl bg-teal text-base font-bold text-white hover:bg-teal-dark disabled:opacity-60"
            >
              {busy === "zip" ? "Building…" : "Download both (.zip)"}
            </button>
            <div className="flex gap-2">
              {([["ttf", ".ttf"], ["woff2", ".woff2 for websites"]] as const).map(([f, label]) => (
                <button key={f} type="button" disabled={busy !== null || hasProblems || !hasGlyphs} onClick={() => download(f)} data-testid={`download-${f}`}
                  className="h-11 flex-1 rounded-xl border border-[#BDCFC2] bg-white text-sm font-bold hover:bg-paper disabled:opacity-60">
                  {busy === f ? "Building…" : label}
                </button>
              ))}
            </div>
            {busy !== null && slow && <BuilderWaking />}
            {error && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-coral-soft px-4 py-3 text-sm font-medium text-ink" data-testid="build-error">
                <span className="min-w-0 flex-1">{error}</span>
                {failed && busy === null && (
                  <button type="button" onClick={() => void download(failed)} data-testid="build-retry" className="h-9 rounded-lg border border-[#BDCFC2] bg-white px-3 font-bold hover:bg-paper">Try again</button>
                )}
              </div>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer font-bold text-teal underline underline-offset-4">How to install on your phone or computer</summary>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 leading-snug text-muted">
                <li><b className="text-ink">Windows:</b> right-click the .ttf and choose Install.</li>
                <li><b className="text-ink">Mac:</b> open the .ttf and choose Install Font.</li>
                <li><b className="text-ink">iPhone and iPad:</b> fonts are added with an app that installs them, such as AnyFont.</li>
                <li><b className="text-ink">Android:</b> most phones cannot change the system font. Use the .ttf inside apps that accept font files.</li>
                <li><b className="text-ink">Websites:</b> upload the .woff2 and load it with @font-face.</li>
              </ul>
            </details>
          </div>
          <Link href="/handwriting/spacing" className="text-center text-sm font-bold text-teal underline underline-offset-4">Back to spacing</Link>
        </aside>
      </main>
    </div>
  );
}
