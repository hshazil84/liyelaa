"""Generate the printable handwriting template and the layout file the web app reads.

  python3 tools/make_template.py

Writes:
  web/public/templates/dhivehi-handwriting-template.pdf   (2 pages, A4)
  web/lib/template-layout.json                            (where every box is, in mm)

Needs: pip install playwright, and Chromium available to Playwright.
"""
import json, os, shutil, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "web/public/fonts/AKRasmee-2.0.woff2"      # reference letters printed in grey on the sheet
OUT_PDF = ROOT / "web/public/templates/dhivehi-handwriting-template.pdf"
OUT_JSON = ROOT / "web/lib/template-layout.json"

PAGE_W, PAGE_H = 210, 297
CELL_W, CELL_H = 30, 34                  # mm
TOP_Y, BASE_Y, WRITE_END, LABEL_H = 6, 19, 27, 7   # mm from box top
PH = dict(x=7, y=BASE_Y - 9, w=16, h=9)  # dotted placeholder in fili boxes, relative to the box
GX, GY = 15, 34
COLS = 6
MARK = 7                                 # corner square size
MARK_POS = dict(tl=(8, 8), tr=195, bl=282)   # top-left corner of each square

LETTERS = list(range(0x0780, 0x07A6))    # 38 letters
FILI = list(range(0x07A6, 0x07B1))       # 11 fili
# (code point, label shown in the box, short name)
EXTRAS = [(0xFDF2, "ﷲ", "Allah"), (0x20C2, "\u20c2", "rufiyaa"), (0x060C, "،", "comma"),
          (0x061B, "؛", "semicolon"), (0x061F, "؟", "question"), (0x201C, "“", "open quote"),
          (0x201D, "”", "close quote"), (0x2018, "‘", "open single"), (0x2019, "’", "close single"),
          (0x00AB, "«", "guillemet L"), (0x00BB, "»", "guillemet R"), (0x28, "(", "bracket"),
          (0x29, ")", "bracket"), (0x2E, ".", "full stop"), (0x21, "!", "exclaim"), (0x3A, ":", "colon")]


def cell_html(c):
    guides = f'<div class="g" style="top:{TOP_Y}mm"></div><div class="g base" style="top:{BASE_Y}mm"></div>'
    ph = f'<div class="ph" style="top:{PH["y"]}mm;left:{PH["x"]}mm;width:{PH["w"]}mm;height:{PH["h"]}mm"></div>' if c["kind"] == "fili" else ""
    label = c["label"].replace("\n", "<br>")
    small = " t" if c["kind"] != "fili" and label.isascii() and len(label) > 2 else ""
    code = c["code"]
    lab = f'<div class="lab"><span class="ref{small}">{label}</span><span class="cd">{code}</span></div>'
    return (f'<div class="box" style="left:{c["x"]}mm;top:{c["y"]}mm;width:{c["w"]}mm;height:{c["h"]}mm">'
            f'{guides}{ph}{lab}</div>')


def grid_pos(i, row_offset=0):
    r, c = divmod(i, COLS)
    return GX + (COLS - 1 - c) * CELL_W, GY + (r + row_offset) * CELL_H     # right-to-left


def build_layout():
    s1, s2 = [], []
    for i, cp in enumerate(LETTERS):
        x, y = grid_pos(i)
        s1.append(dict(id=f"{cp:04X}", cp=[cp], kind="letter", x=x, y=y, w=CELL_W, h=CELL_H, label=chr(cp), code=f"U+{cp:04X}"))
    for i, cp in enumerate(FILI):
        x, y = grid_pos(i)
        s2.append(dict(id=f"{cp:04X}", cp=[cp], kind="fili", x=x, y=y, w=CELL_W, h=CELL_H, label="◌" + chr(cp), code=f"U+{cp:04X}"))
    y0 = GY + 2 * CELL_H + 6
    s2.append(dict(id="FDFD", cp=[0xFDFD], kind="symbol", x=GX + 4 * CELL_W, y=y0, w=2 * CELL_W, h=CELL_H, label="﷽", code="U+FDFD"))
    for i, (cp, label, name) in enumerate(EXTRAS):
        if i < 4:
            x, y = GX + (3 - i) * CELL_W, y0
        else:
            j = i - 4
            r, c = divmod(j, COLS)
            x, y = GX + (COLS - 1 - c) * CELL_W, y0 + (r + 1) * CELL_H
        code = f"U+{cp:04X}" if cp > 127 and label.strip() and "\n" not in label else name
        s2.append(dict(id=f"{cp:04X}", cp=[cp], kind="symbol", x=x, y=y, w=CELL_W, h=CELL_H, label=label, code=code))
    return s1, s2


CSS = f"""
@font-face{{font-family:Th;src:url(ref.woff2)}}
@page{{size:A4;margin:0}} *{{box-sizing:border-box}} body{{margin:0;font-family:system-ui,Arial,sans-serif;color:#222}}
.pg{{position:relative;width:{PAGE_W}mm;height:{PAGE_H}mm;page-break-after:always;overflow:hidden;background:#fff}}
.mk{{position:absolute;width:{MARK}mm;height:{MARK}mm;background:#000}}
.mk.hole::after{{content:"";position:absolute;left:2.2mm;top:2.2mm;width:2.6mm;height:2.6mm;background:#fff}}
.hd{{position:absolute;left:20mm;right:20mm;top:11mm;font-size:12pt}} .pn{{float:right;color:#666;font-size:10pt}}
.tip{{position:absolute;left:15mm;right:15mm;top:19mm;font-size:9pt;line-height:1.45;color:#444}}
.box{{position:absolute;border:.3mm solid #cfcfcf}}
.g{{position:absolute;left:0;right:0;border-top:.25mm dashed #e2e2e2}} .g.base{{border-top:.35mm solid #d8d8d8}}
.ph{{position:absolute;border:.3mm dotted #d6d6d6;border-radius:2mm}}
.lab{{position:absolute;left:0;right:0;bottom:0;height:{LABEL_H}mm;border-top:.25mm solid #e6e6e6;display:flex;justify-content:space-between;align-items:center;padding:0 1.5mm;direction:ltr}}
.ref{{font-family:Th,system-ui,serif;font-size:19pt;color:#8c8c8c;line-height:1.9;display:inline-block}} .ref.t{{font-family:system-ui,Arial;font-size:7pt;line-height:1.1}}
.cd{{font-size:6pt;color:#9a9a9a}}
.sec{{position:absolute;left:15mm;font-size:9pt;color:#555;font-weight:600}}
"""


def page(title, tip, body, n):
    marks = "".join(
        f'<div class="mk{" hole" if (x, y) == (8, 8) else ""}" style="left:{x}mm;top:{y}mm"></div>'
        for x, y in ((8, 8), (195, 8), (8, 282), (195, 282)))
    return (f'<section class="pg">{marks}<div class="hd"><b>Dhivehi Font Maker</b> &nbsp;·&nbsp; {title}'
            f'<span class="pn">Sheet {n} of 2</span></div><div class="tip">{tip}</div>{body}</section>')


def build_html(overlay1="", overlay2=""):
    """The whole template as one HTML string. overlay1/overlay2 are extra markup drawn on top of each sheet."""
    s1, s2 = build_layout()
    tip1 = ("Use a <b>dark marker or felt-tip</b> (not pencil). Write each letter inside its box, sitting on the solid "
            "<b>baseline</b>; tall parts can reach the top dashed line. Keep the sheet flat, in daylight, and don't cover "
            "the four black squares in the corners.")
    tip2 = ("Write only the vowel mark (fili) where it would sit on the dotted letter-box: <b>above</b> the baseline for most, "
            "<b>below</b> for ibifili and eebeefili (the 3rd and 4th marks). Extras are optional - skip any you don't want.")
    sec = f'<div class="sec" style="top:{GY + 2 * CELL_H + 1}mm">Extras (optional)</div>'
    return (f"<!doctype html><meta charset=utf-8><style>{CSS}</style>"
            + page("Letters", tip1, "".join(map(cell_html, s1)) + overlay1, 1)
            + page("Vowel marks and extras", tip2, "".join(map(cell_html, s2)) + sec + overlay2, 2))


def main():
    s1, s2 = build_layout()
    html = build_html()
    tmp = Path(tempfile.mkdtemp())
    shutil.copy(FONT, tmp / "ref.woff2")
    (tmp / "t.html").write_text(html)
    OUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    chrome = "/opt/pw-browsers/chromium"
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
        pg = b.new_page()
        pg.goto(f"file://{tmp}/t.html")
        pg.wait_for_timeout(500)
        pg.pdf(path=str(OUT_PDF), width=f"{PAGE_W}mm", height=f"{PAGE_H}mm", print_background=True)
        b.close()
    layout = dict(
        page=dict(w=PAGE_W, h=PAGE_H),
        marks=[dict(id="tl", cx=8 + MARK / 2, cy=8 + MARK / 2, hole=True), dict(id="tr", cx=195 + MARK / 2, cy=8 + MARK / 2),
               dict(id="bl", cx=8 + MARK / 2, cy=282 + MARK / 2), dict(id="br", cx=195 + MARK / 2, cy=282 + MARK / 2)],
        markSize=MARK,
        guides=dict(topY=TOP_Y, baseY=BASE_Y, writeEnd=WRITE_END, labelH=LABEL_H),
        placeholder=PH,
        sheets=[dict(id=1, title="Letters", cells=s1), dict(id=2, title="Vowel marks and extras", cells=s2)],
    )
    OUT_JSON.write_text(json.dumps(layout, ensure_ascii=False, indent=1))
    print("wrote", OUT_PDF.relative_to(ROOT), OUT_JSON.relative_to(ROOT), "cells:", len(s1), len(s2))


if __name__ == "__main__":
    main()
