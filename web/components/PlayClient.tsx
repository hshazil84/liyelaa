"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import {
  BASES, BaseId, BuildFormat, DEFAULTS, LIMITS, PRESETS, PlaySettings,
  baseOf, buildFont, changes, cleanName, loadPreviewFace, previewStyle, saveBlob,
} from "@/lib/play";

const STORAGE_KEY = "dfm.play.v1";
const SAMPLE = "ދިވެހިބަސް";
const STEPS = [{ label: "Start", href: "/" }, { label: "Play" }, { label: "Save your font" }];

type PreviewState = "idle" | "loading" | "ready" | "error";

function Slider({
  label, value, onChange, min, max, step, format, hint,
}: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number;
  format: (v: number) => string; hint?: string;
}) {
  const id = `s-${label.toLowerCase()}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-bold">{label}</label>
        <span className="text-sm tabular-nums text-muted">{format(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p className="text-[13px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

export function PlayClient() {
  const [s, setS] = useState<PlaySettings>(DEFAULTS);
  const [text, setText] = useState(SAMPLE);
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState<BuildFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [builtFamily, setBuiltFamily] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const faceRef = useRef<FontFace | null>(null);

  const base = baseOf(s.base);

  // Settings live in this browser only. No account needed.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = { ...DEFAULTS, ...JSON.parse(raw) } as PlaySettings;
        if (!BASES.some((b) => b.id === saved.base)) saved.base = DEFAULTS.base;
        setS(saved);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }, [s]);

  // A one-weight base cannot be restyled by CSS, so its preview is the real font made by the builder.
  useEffect(() => {
    if (base.variable) {
      setBuiltFamily(null);
      setPreviewState("idle");
      return;
    }
    const ctrl = new AbortController();
    setPreviewState("loading");
    const timer = setTimeout(async () => {
      try {
        const { family, face } = await loadPreviewFace(s, ctrl.signal);
        if (ctrl.signal.aborted) { document.fonts.delete(face); return; }
        if (faceRef.current) document.fonts.delete(faceRef.current);
        faceRef.current = face;
        setBuiltFamily(family);
        setPreviewState("ready");
      } catch {
        if (!ctrl.signal.aborted) setPreviewState("error");
      }
    }, 180);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [base.variable, s.base, s.weight, s.width, s.slant, s.spacing]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof PlaySettings>(k: K, v: PlaySettings[K]) => setS((p) => ({ ...p, [k]: v }));

  async function download(format: BuildFormat) {
    setBusy(format);
    setError(null);
    try {
      const { blob, filename } = await buildFont(s, format);
      saveBlob(blob, filename);
    } catch (e) {
      setError(e instanceof TypeError ? "Could not reach the font builder. Is it running?" : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const sample = (
    <div
      className="relative flex min-h-[260px] items-center justify-center overflow-x-auto rounded-[20px] bg-white p-6"
      aria-label="Preview"
      data-testid="preview"
      data-preview-state={previewState}
    >
      <div lang="dv" dir="rtl" className="text-ink" style={{ ...previewStyle(s, builtFamily), fontSize: 96, lineHeight: 1.6 }} data-testid="preview-text">
        {text || SAMPLE}
      </div>
      {!base.variable && previewState === "error" && (
        <p role="status" className="absolute bottom-3 left-4 right-4 text-[13px] text-plum">
          Could not reach the font builder, so this preview is out of date.
        </p>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white px-10 py-4">
        <Logo />
        <Stepper steps={STEPS} current={step} />
        <span className="hidden items-center gap-2 text-sm text-muted 2xl:flex">
          <span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser
        </span>
      </header>

      {step === 1 ? (
        <main className="mx-auto flex w-full max-w-[1240px] flex-wrap items-start gap-6 px-10 py-8">
          <section aria-label="Controls" className="flex w-full flex-col gap-6 rounded-3xl border border-line bg-white p-5 lg:w-[320px]">
            <h1 className="font-display text-2xl font-bold">Play with a font</h1>
            <div role="group" aria-label="Presets" className="grid grid-cols-4 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={s.weight === p.weight}
                  onClick={() => set("weight", p.weight)}
                  className={`h-10 rounded-[10px] border text-sm font-bold ${s.weight === p.weight ? "border-ink bg-ink text-white" : "border-[#BDCFC2] bg-white hover:bg-paper"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Slider
              label="Weight"
              value={s.weight}
              onChange={(v) => set("weight", v)}
              {...LIMITS.weight}
              format={(v) => String(v)}
              hint={base.variable ? undefined : `${base.label} has one weight. Lighter and bolder are made by thinning or thickening every letter.`}
            />
            <Slider label="Width" value={s.width} onChange={(v) => set("width", v)} {...LIMITS.width} format={(v) => `${v}%`} />
            <Slider label="Slant" value={s.slant} onChange={(v) => set("slant", v)} {...LIMITS.slant} format={(v) => `${v}°`} />
            <Slider label="Spacing" value={s.spacing} onChange={(v) => set("spacing", v)} {...LIMITS.spacing} format={(v) => (v > 0 ? `+${v}` : String(v))} />
            <button type="button" onClick={() => setS({ ...DEFAULTS, name: s.name, base: s.base })} className="h-10 rounded-[10px] border border-[#BDCFC2] text-sm font-bold hover:bg-paper">
              Reset
            </button>
          </section>

          <section aria-label="Preview" className="flex min-w-0 flex-[1_1_480px] flex-col gap-4">
            <label className="flex flex-col gap-2 text-sm font-bold">
              Type your own text
              <input
                lang="dv"
                dir="rtl"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="h-12 rounded-xl border border-[#BDCFC2] bg-white px-4 font-thaana text-2xl font-normal"
              />
            </label>
            {sample}
          </section>

          <aside className="flex w-full flex-col gap-4 lg:w-[300px]">
            <div className="flex flex-col gap-2.5 rounded-3xl border border-line bg-white p-5">
              <span id="base-label" className="text-[13px] text-muted">Starting font</span>
              <div role="radiogroup" aria-labelledby="base-label" className="flex flex-col gap-2.5">
                {BASES.map((b) => {
                  const on = s.base === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set("base", b.id as BaseId)}
                      className={`flex flex-col gap-0.5 rounded-2xl text-left ${on ? "border-[1.5px] border-edge bg-teal-soft p-[13px]" : "border border-line bg-white p-3.5 hover:bg-paper"}`}
                    >
                      <span lang="dv" dir="rtl" className="w-full text-[30px] leading-[1.5]" style={{ fontFamily: `${b.family}, sans-serif` }}>{SAMPLE}</span>
                      <span className="text-[15px] font-bold">{b.label}</span>
                      <span className="text-[13px] text-muted">{b.blurb}</span>
                    </button>
                  );
                })}
              </div>
              <span className="text-[13px] leading-snug text-muted">Open Font License. {base.credit}.</span>
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal text-lg font-bold text-white hover:bg-teal-dark"
            >
              Save my font
            </button>
          </aside>
        </main>
      ) : (
        <main className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-10 py-10">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-4xl font-bold">Your font is ready</h1>
            <ul className="flex flex-wrap gap-2" aria-label="What you changed">
              {changes(s).map((c) => (
                <li key={c} className="rounded-full bg-teal-soft px-3 py-1 text-sm font-medium text-teal-dark">{c}</li>
              ))}
            </ul>
          </div>
          {sample}
          <label className="flex max-w-md flex-col gap-2 text-sm font-bold">
            Font name
            <input
              value={s.name}
              onChange={(e) => set("name", cleanName(e.target.value))}
              maxLength={40}
              className="h-12 rounded-xl border border-[#BDCFC2] bg-white px-4 text-base font-normal"
            />
            <span className="text-[13px] font-normal text-muted">Letters, numbers, spaces and hyphens.</span>
          </label>
          <div className="flex flex-wrap gap-3">
            {([["zip", "Download both (.zip)"], ["ttf", "Download .ttf"], ["woff2", "Download .woff2"]] as const).map(([f, label], i) => (
              <button
                key={f}
                type="button"
                disabled={busy !== null}
                onClick={() => download(f)}
                className={`h-14 rounded-2xl px-6 text-base font-bold disabled:opacity-60 ${i === 0 ? "bg-teal text-white hover:bg-teal-dark" : "border border-[#BDCFC2] bg-white hover:bg-paper"}`}
              >
                {busy === f ? "Building…" : label}
              </button>
            ))}
          </div>
          {error && <p role="alert" className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-medium text-ink">{error}</p>}
          <p className="text-sm leading-normal text-muted">
            Based on {base.credit} (SIL Open Font License). Your font keeps that licence and needs its own name.
            To install it, open the .ttf file and choose Install.
          </p>
          <div>
            <button type="button" onClick={() => setStep(1)} className="text-sm font-bold text-teal underline underline-offset-4">
              Back to playing
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
