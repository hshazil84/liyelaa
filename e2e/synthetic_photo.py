"""Make fake phone photos of a filled-in template, to test the tracing pipeline without a real photo.

  python3 e2e/synthetic_photo.py [outdir]

Writes sheet1_tilt.jpg, sheet1_sideways.jpg, sheet1_upside.jpg, sheet2_tilt.jpg and truth.json.
"""
import json, os, random, shutil, sys, tempfile
from pathlib import Path
import cv2
import numpy as np
from fontTools.ttLib import TTFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import make_template as mt  # noqa: E402

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "e2e/out")
OUT.mkdir(parents=True, exist_ok=True)
LAYOUT = json.loads((ROOT / "web/lib/template-layout.json").read_text())
FONT_WOFF = ROOT / "web/public/fonts/NotoSansThaana-Variable.woff2"
INK = "#1a2a6c"
PALE = "#b9b9b9"
FONT_SIZE = 26          # mm, makes the letters fill the box like real handwriting
SPECIAL_LIGHT = "0786"  # drawn in very pale ink
SPECIAL_EDGE = "0795"   # drawn too big, runs into the box edge
rng = random.Random(7)


def font_info():
    f = TTFont(str(FONT_WOFF))
    return f.getBestCmap()


def overlay(sheet, cmap):
    parts = ['<style>@font-face{font-family:Hand;src:url(thaana.woff2);font-weight:100 900}</style>',
             '<svg style="position:absolute;left:0;top:0" width="210mm" height="297mm" viewBox="0 0 210 297">']
    truth = {}
    for c in sheet["cells"]:
        cp = c["cp"][0]
        if cp not in cmap:
            truth[c["id"]] = "empty"
            continue
        ch = chr(cp)
        cx, by = c["x"] + c["w"] / 2, c["y"] + LAYOUT["guides"]["baseY"]
        # people write marks and punctuation smaller than letters; keep them inside their boxes
        size = FONT_SIZE * {"FDFD": 0.62, "FDF2": 0.6}.get(c["id"], 0.5 if c["kind"] != "letter" else 1.0)
        color, stroke = INK, 0.25
        status = "ok"
        if c["id"] == SPECIAL_LIGHT: color, status = PALE, "light"
        if c["id"] == SPECIAL_EDGE: size, status = FONT_SIZE * 1.9, "ok+edge"
        jx, jy, rot = rng.uniform(-0.7, 0.7), rng.uniform(-0.4, 0.4), rng.uniform(-2.5, 2.5)
        tf = f'transform="rotate({rot:.2f} {cx + jx:.2f} {by + jy:.2f})"'
        attrs = (f'font-family="Hand" font-weight="520" font-size="{size}" text-anchor="middle" '
                 f'stroke-linejoin="round" {tf}')
        if c["kind"] == "fili":
            base = "ބ"                       # a base letter, painted over so only the mark stays
            parts.append(f'<text x="{cx + jx}" y="{by + jy}" fill="{color}" stroke="{color}" stroke-width="{stroke}" {attrs}>{base}{ch}</text>')
            parts.append(f'<text x="{cx + jx}" y="{by + jy}" fill="#fff" stroke="#fff" stroke-width="0.9" {attrs}>{base}</text>')
        else:
            parts.append(f'<text x="{cx + jx}" y="{by + jy}" fill="{color}" stroke="{color}" stroke-width="{stroke}" {attrs}>{ch}</text>')
        truth[c["id"]] = status
    parts.append("</svg>")
    return "".join(parts), truth


def render_sheets():
    cmap = font_info()
    o1, t1 = overlay(LAYOUT["sheets"][0], cmap)
    o2, t2 = overlay(LAYOUT["sheets"][1], cmap)
    html = mt.build_html(o1, o2)
    tmp = Path(tempfile.mkdtemp())
    shutil.copy(FONT_WOFF, tmp / "thaana.woff2")      # the "handwriting"
    shutil.copy(mt.FONT, tmp / "ref.woff2")            # the grey reference letters, as in the real template
    (tmp / "t.html").write_text(html)
    chrome = "/opt/pw-browsers/chromium"
    pngs = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch()
        pg = b.new_page(viewport={"width": 794, "height": 1123}, device_scale_factor=3)
        pg.goto(f"file://{tmp}/t.html")
        pg.wait_for_timeout(800)
        for n in (1, 2):
            pg.evaluate(f"document.querySelectorAll('.pg').forEach((e,i)=>e.style.display=(i=={n-1})?'block':'none')")
            path = OUT / f"flat_sheet{n}.png"
            pg.screenshot(path=str(path), clip={"x": 0, "y": 0, "width": 794, "height": 1123})
            pngs.append(path)
        b.close()
    return pngs, {"1": t1, "2": t2}


def simulate(flat_path, out_path, rot, canvas, tilt, seed):
    r = np.random.RandomState(seed)
    img = cv2.imread(str(flat_path))
    h, w = img.shape[:2]
    cw, ch = canvas
    # page corners on the desk: scale to fit, rotate, then pinch/skew a bit for perspective
    fit = min(cw / w, ch / h) * 0.8 if rot % 180 == 0 else min(cw / h, ch / w) * 0.8
    pw, ph = w * fit, h * fit
    pts = np.array([[-pw / 2, -ph / 2], [pw / 2, -ph / 2], [pw / 2, ph / 2], [-pw / 2, ph / 2]])
    a = np.radians(rot)
    R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    dst = pts @ R.T + np.array([cw / 2, ch / 2])
    dst += r.uniform(-1, 1, dst.shape) * tilt * np.array([cw, ch]) * 0.02
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    M = cv2.getPerspectiveTransform(src, np.float32(dst))
    warped = cv2.warpPerspective(img, M, (cw, ch), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
    mask = cv2.warpPerspective(np.full((h, w), 255, np.uint8), M, (cw, ch))
    desk = np.zeros((ch, cw, 3), np.float32) + np.array([48, 78, 120], np.float32)       # brown desk (BGR)
    desk += cv2.GaussianBlur(r.randn(ch, cw).astype(np.float32) * 40, (0, 0), 3)[..., None]
    paper = warped.astype(np.float32) * np.array([0.80, 0.90, 0.97], np.float32)         # warm indoor light
    m = (mask.astype(np.float32) / 255)[..., None]
    comp = paper * m + desk * (1 - m)
    yy, xx = np.mgrid[0:ch, 0:cw].astype(np.float32)
    light = 1.05 - 0.28 * (xx / cw) - 0.12 * (yy / ch)                                    # uneven lighting
    shadow = 1 - 0.18 * np.exp(-(((xx - cw * 0.25) ** 2 + (yy - ch * 0.7) ** 2) / (2 * (cw * 0.2) ** 2)))
    comp *= (light * shadow)[..., None]
    comp = cv2.GaussianBlur(comp, (0, 0), 1.1)                                             # soft focus
    comp += r.randn(ch, cw, 3).astype(np.float32) * 3.5                                    # sensor noise
    cv2.imwrite(str(out_path), np.clip(comp, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 78])


if __name__ == "__main__":
    pngs, truth = render_sheets()
    simulate(pngs[0], OUT / "sheet1_tilt.jpg", 6, (3024, 4032), 1.0, 1)
    simulate(pngs[0], OUT / "sheet1_sideways.jpg", 94, (4032, 3024), 0.7, 2)
    simulate(pngs[0], OUT / "sheet1_upside.jpg", 183, (3024, 4032), 0.7, 3)
    simulate(pngs[1], OUT / "sheet2_tilt.jpg", -5, (3024, 4032), 1.0, 4)
    (OUT / "truth.json").write_text(json.dumps(truth, indent=1))
    print("wrote", sorted(p.name for p in OUT.glob("*.jpg")))
