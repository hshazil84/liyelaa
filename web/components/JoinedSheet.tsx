"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { joinedPages } from "@/lib/handwriting/joined";
import { layout } from "@/lib/handwriting/pipeline-layout";
import type { Ligature } from "@/lib/handwriting/extras";
import { loadProject } from "@/lib/handwriting/store";

const { guides, marks, markSize: MARK, page: PAGE } = layout;

// the same look as the printed template (tools/make_template.py), so a photo of it reads the same way
const CSS = `
@font-face{font-family:Th;src:url(/fonts/AKRasmee-2.0.woff2)}
@page{size:A4;margin:0}
.js-bar{position:sticky;top:0;z-index:5}
.js-pg{position:relative;width:${PAGE.w}mm;height:${PAGE.h}mm;background:#fff;overflow:hidden;margin:0 auto 24px;box-shadow:0 2px 14px rgba(38,64,34,.15);color:#222;font-family:system-ui,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.js-mk{position:absolute;width:${MARK}mm;height:${MARK}mm;background:#000}
.js-mk.hole::after{content:"";position:absolute;left:2.2mm;top:2.2mm;width:2.6mm;height:2.6mm;background:#fff}
.js-hd{position:absolute;left:20mm;right:20mm;top:11mm;font-size:12pt}.js-pn{float:right;color:#666;font-size:10pt}
.js-tip{position:absolute;left:15mm;right:15mm;top:19mm;font-size:9pt;line-height:1.45;color:#444}
.js-box{position:absolute;box-sizing:border-box;border:.3mm solid #cfcfcf}
.js-g{position:absolute;left:0;right:0;border-top:.25mm dashed #e2e2e2}.js-g.base{border-top:.35mm solid #d8d8d8}
.js-lab{position:absolute;left:0;right:0;bottom:0;height:${guides.labelH}mm;border-top:.25mm solid #e6e6e6;display:flex;justify-content:space-between;align-items:center;padding:0 1.5mm;direction:ltr}
.js-ref{font-family:Th,system-ui,serif;font-size:19pt;color:#8c8c8c;line-height:1.9;display:inline-block}
.js-cd{font-size:6pt;color:#9a9a9a}
@media print{body{background:#fff!important}.js-root{padding:0!important;min-height:0!important;background:#fff!important}.js-sheets{margin:0!important}.js-noprint{display:none!important}.js-pg{margin:0;box-shadow:none;break-after:page}.js-pg:last-child{break-after:auto}}
`;

export function JoinedSheet() {
  const [ligs, setLigs] = useState<Ligature[] | null>(null);
  useEffect(() => { loadProject().then((p) => setLigs(p.ligatures ?? [])); }, []);
  const pages = ligs ? joinedPages(ligs) : [];
  const total = 2 + pages.length;

  return (
    <div className="js-root min-h-screen bg-paper pb-10">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="js-noprint js-bar flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-white px-6 py-3">
        <Link href="/handwriting/ligatures" className="text-sm font-bold text-teal underline underline-offset-4">Back to joined letters</Link>
        <p className="min-w-0 flex-1 text-[13px] text-muted">
          Press Print, then choose <b>Save as PDF</b> or your printer. Print at 100%, margins none, with no headers or footers.
          Write each joined shape in its box with a dark marker.
        </p>
        <button type="button" onClick={() => window.print()} disabled={!pages.length} data-testid="print-now" className="h-11 rounded-xl bg-teal px-5 text-[15px] font-bold text-white hover:bg-teal-dark disabled:opacity-40">
          Print or save as PDF
        </button>
      </div>

      {ligs && !pages.length && <p className="js-noprint mx-auto mt-8 max-w-[52ch] px-6 text-center text-base text-muted">No joined letters yet. Add some first, then come back to print them.</p>}

      <div className="js-sheets mt-6" data-testid="sheets">
        {pages.map((pg) => (
          <section key={pg.id} className="js-pg" data-sheet={pg.id}>
            {marks.map((m) => (
              <div key={m.id} className={`js-mk${m.hole ? " hole" : ""}`} style={{ left: `${m.cx - MARK / 2}mm`, top: `${m.cy - MARK / 2}mm` }} />
            ))}
            <div className="js-hd"><b>MyAkuru</b> &nbsp;·&nbsp; Joined letters<span className="js-pn">Sheet {pg.id} of {total}</span></div>
            <div className="js-tip">
              Write the whole joined shape inside its box, sitting on the solid <b>baseline</b>, including any vowel marks that belong to it.
              Skip any you don&apos;t want. Keep the sheet flat, in daylight, and don&apos;t cover the four black squares in the corners.
            </div>
            {pg.cells.map((c) => (
              <div key={c.id} className="js-box" data-box={c.id} style={{ left: `${c.x}mm`, top: `${c.y}mm`, width: `${c.w}mm`, height: `${c.h}mm` }}>
                <div className="js-g" style={{ top: `${guides.topY}mm` }} />
                <div className="js-g base" style={{ top: `${guides.baseY}mm` }} />
                <div className="js-lab"><span className="js-ref" lang="dv">{c.label}</span><span className="js-cd">{c.code}</span></div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
