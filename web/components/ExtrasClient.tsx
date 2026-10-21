"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExtrasNav } from "@/components/ExtrasNav";
import { GlyphEditor } from "@/components/GlyphEditor";
import { GlyphSvg } from "@/components/GlyphTile";
import { WordSvg } from "@/components/MarkViews";
import { Logo } from "@/components/Logo";
import { Stepper } from "@/components/Stepper";
import { DEFAULT_EXTRAS, SYMBOL_GROUPS, shownText, type Extras } from "@/lib/handwriting/extras";
import { emptySpacing } from "@/lib/handwriting/spacing";
import { layout } from "@/lib/handwriting/pipeline";
import { useSteps } from "@/lib/handwriting/steps";
import { loadProject, removeGlyph, saveExtras, updateGlyph } from "@/lib/handwriting/store";
import type { Glyph, LayoutCell } from "@/lib/handwriting/types";

const CELLS = new Map<string, LayoutCell>(layout.sheets[1].cells.map((c) => [c.id, c]));
const FIRST = SYMBOL_GROUPS[0].items[0].id;
// typed with the keys on a keyboard where it helps: the preview shows what the font will show
const SAMPLES = ["ދިވެހިބަސް؟", "ދިވެހި، ބަސް؛", "«ދިވެހި» ބަސް.", "“ދިވެހި” ބަސް!"];

function Switch({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-[18px] w-[18px] shrink-0 accent-teal" />
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold">{label}</span>
        <span className="text-[13px] leading-snug text-muted">{hint}</span>
      </span>
    </label>
  );
}

export function ExtrasClient() {
  const steps = useSteps();
  const [glyphs, setGlyphs] = useState<Record<string, Glyph>>({});
  const [originals, setOriginals] = useState<Record<string, Glyph>>({});
  const [ex, setEx] = useState<Extras>(DEFAULT_EXTRAS);
  const [loaded, setLoaded] = useState(false);
  const [selId, setSelId] = useState(FIRST);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    loadProject().then((p) => {
      setGlyphs(p.glyphs);
      setOriginals(p.originals ?? {});
      setEx({ ...DEFAULT_EXTRAS, ...p.extras });
      setLoaded(true);
    });
  }, []);

  const persist = useCallback((job: () => Promise<unknown>) => { queue.current = queue.current.then(job, job); }, []);
  const cell = CELLS.get(selId)!;
  const name = SYMBOL_GROUPS.flatMap((g) => g.items).find((i) => i.id === selId)?.name ?? cell.label;

  const onChange = useCallback((id: string, g: Glyph | null) => {
    if (g) {
      setGlyphs((p) => ({ ...p, [id]: g }));
      persist(async () => { const p = await updateGlyph(g); setOriginals(p.originals ?? {}); });
    } else {
      setGlyphs((p) => { const n = { ...p }; delete n[id]; return n; });
      persist(async () => { const p = await removeGlyph(id); setOriginals(p.originals ?? {}); });
    }
  }, [persist]);

  const setOpt = (patch: Partial<Extras>) => {
    const next = { ...ex, ...patch };
    setEx(next);
    persist(() => saveExtras(next));
  };

  const drawn = (id: string) => !!glyphs[id]?.contours.length;
  const total = SYMBOL_GROUPS.reduce((n, g) => n + g.items.length, 0);
  const done = SYMBOL_GROUPS.reduce((n, g) => n + g.items.filter((i) => drawn(i.id)).length, 0);
  const sp = useMemo(() => emptySpacing(), []);
  const hasLetters = Object.values(glyphs).some((g) => g.kind === "letter" && g.contours.length);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line bg-white px-10 py-4">
        <Logo />
        <Stepper steps={steps} current={5} />
        <span className="flex items-center gap-2 text-sm text-muted"><span className="h-2 w-2 rounded-full bg-teal" />Saved in this browser</span>
      </header>
      <ExtrasNav current="symbols" />

      <main className="mx-auto flex w-full max-w-[1280px] flex-wrap items-start gap-6 px-10 py-6">
        <section aria-label="Signs and punctuation" className="flex w-full flex-col gap-5 rounded-3xl border border-line bg-white p-5 lg:w-[340px]">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-bold">Signs and punctuation</h2>
            <span className="text-sm text-muted" data-testid="progress">{done} of {total} drawn</span>
          </div>
          <p className="text-[13px] leading-snug text-muted">All optional. Anything you skip comes from the open starter font.</p>
          {SYMBOL_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <h3 className="text-sm font-bold">{group.title}</h3>
              <ul className="grid grid-cols-3 gap-2">
                {group.items.map((it) => {
                  const g = glyphs[it.id];
                  const on = it.id === selId;
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => setSelId(it.id)}
                        aria-label={`${it.name}${drawn(it.id) ? ", drawn" : ", not drawn"}`}
                        aria-current={on ? "true" : undefined}
                        data-cell={it.id}
                        data-status={drawn(it.id) ? "drawn" : "missing"}
                        className={`flex h-[84px] w-full flex-col items-center justify-between rounded-xl px-1 py-1.5 ${on ? "border-2 border-coral bg-white" : drawn(it.id) ? "border border-[#BFDCD8] bg-teal-soft" : "border border-dashed border-[#B6C2BF] bg-[#F3F6F5]"}`}
                      >
                        <span className="flex h-[48px] w-full items-center justify-center">
                          {g?.contours.length ? <GlyphSvg glyph={g} className="h-full w-full" /> : <span lang="dv" className="font-thaana text-[26px] leading-none text-muted">{CELLS.get(it.id)?.label}</span>}
                        </span>
                        <span className="px-0.5 text-center text-[11px] leading-tight text-muted">{it.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[12px] text-muted">{group.note}</p>
            </div>
          ))}
        </section>

        <section aria-label="Drawing area" className="flex min-w-0 flex-[1_1_520px] flex-col gap-4 rounded-3xl border border-line bg-white p-5">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-xl font-bold">{name}</h1>
            <span className="text-sm text-muted">U+{cell.id}</span>
          </div>
          {loaded && (
            <GlyphEditor key={cell.id} cell={cell} glyph={glyphs[cell.id] ?? null} original={originals[cell.id] ?? null} onChange={(g) => onChange(cell.id, g)} />
          )}
        </section>

        <aside aria-label="Choices and preview" className="flex w-full flex-col gap-4 lg:w-[320px]">
          <div className="flex flex-col gap-4 rounded-3xl border border-line bg-white p-5">
            <h2 className="font-display text-lg font-bold">What the font does</h2>
            <Switch id="latin" label="Typing , ; ? gives the Thaana marks" hint="On a normal keyboard these keys type the English comma, semicolon and question mark. With this on, they show the ones you drew." checked={ex.latinPunctuation} onChange={(v) => setOpt({ latinPunctuation: v })} />
            <Switch id="quotes" label="Flip quote marks for Thaana" hint="Thaana reads right to left, so an opening quote should face the other way. This swaps them for you." checked={ex.rtlQuotes} onChange={(v) => setOpt({ rtlQuotes: v })} />
            <Switch id="rufiyaa" label="Also keep the rufiyaa at a spare slot" hint="Many programs do not know the new rufiyaa sign yet. This lets people still type it with a private slot (U+E000). Only works if you drew it." checked={ex.rufiyaaPrivateUse} onChange={(v) => setOpt({ rufiyaaPrivateUse: v })} />
          </div>
          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-5">
            <h2 className="font-display text-lg font-bold">Preview</h2>
            {hasLetters ? (
              <div className="flex flex-col items-start gap-1 overflow-x-auto rounded-[14px] bg-[#F3F6F5] px-4 py-3" dir="rtl">
                {SAMPLES.map((t) => (
                  <WordSvg key={t} text={shownText(t, ex)} glyphs={glyphs} offsets={{}} spacing={sp} height={52} />
                ))}
              </div>
            ) : (
              <p role="status" className="rounded-xl bg-sand px-3 py-2.5 text-sm">
                Draw some letters first to see them here. <Link href="/handwriting/letters" className="font-bold text-teal underline underline-offset-4">Go to your letters</Link>.
              </p>
            )}
            <p className="text-[12px] leading-snug text-muted">Only your own drawings show here. Gaps are signs you have not drawn.</p>
          </div>
          <Link href="/handwriting/ligatures" data-testid="continue-ligatures" className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal text-base font-bold text-white hover:bg-teal-dark">
            Next: joined letters <span aria-hidden>→</span>
          </Link>
          <Link href="/handwriting/export" data-testid="skip-export" className="text-center text-sm font-bold text-teal underline underline-offset-4">Skip to test and export</Link>
        </aside>
      </main>
    </div>
  );
}
