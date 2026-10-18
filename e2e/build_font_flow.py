"""Traced letters -> builder -> real font, rendered in the browser. Needs web on :3000 and builder on :8000.
   python3 e2e/build_font_flow.py <dir with the synthetic photos> [outdir]"""
import base64, io, json, os, sys, tempfile, urllib.request, zipfile
from pathlib import Path
from fontTools.ttLib import TTFont
from playwright.sync_api import sync_playwright

PHOTOS = Path(sys.argv[1])
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(tempfile.mkdtemp())
OUT.mkdir(parents=True, exist_ok=True)
WEB = os.environ.get("WEB_URL", "http://localhost:3000")
BUILDER = os.environ.get("BUILDER_URL", "http://localhost:8000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
WORDS = ["ދިވެހިބަސް", "ގައުމީ މަޖިލިސް", "ހިތްހަމަޖެހޭ", "ޤުރުއާން ﷲ", "ބަލަ، ކޮބާ؟ “ދެން”"]


def traced_project():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_page()
        for sheet, name in ((1, "sheet1_tilt.jpg"), (2, "sheet2_tilt.jpg")):
            pg.goto(f"{WEB}/handwriting")
            pg.get_by_text("Sheet 1 · Letters" if sheet == 1 else "Sheet 2 · Marks").click()
            pg.get_by_test_id("photo-input").set_input_files(str(PHOTOS / name))
            pg.wait_for_selector("[data-testid=summary]", timeout=60000)
            pg.get_by_test_id("use-letters").click()
            pg.wait_for_selector("[data-testid=saved-summary]")
        proj = pg.evaluate("""() => new Promise((res) => { const r = indexedDB.open('keyval-store');
          r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result); }; })""")
        b.close()
    return proj


def main():
    proj = traced_project()
    glyphs = [{k: g[k] for k in ("id", "cp", "contours", "adv")} for g in proj["glyphs"].values()]
    body = json.dumps({"name": "Synthetic Hand", "author": "Test", "glyphs": glyphs, "format": "zip"}).encode()
    req = urllib.request.Request(f"{BUILDER}/handwriting/build", body, {"content-type": "application/json"})
    with urllib.request.urlopen(req) as r:
        data, filled, drawn = r.read(), r.headers["x-dfm-filled"], r.headers["x-dfm-drawn"]
    z = zipfile.ZipFile(io.BytesIO(data))
    ttf = z.read("Synthetic-Hand.ttf")
    (OUT / "synthetic-hand.ttf").write_bytes(ttf)
    f = TTFont(io.BytesIO(ttf))
    print(f"built: {len(f.getGlyphOrder())} glyphs, {drawn} drawn, {len(filled.split(',')) if filled else 0} from the starter font, {len(data)//1024} KB zip")
    assert int(drawn) >= 40 and all(cp in f.getBestCmap() for cp in range(0x780, 0x7B2))
    b64 = base64.b64encode(ttf).decode()
    rows = "".join(f'<div style="font-size:64px;line-height:1.7">{w}</div>' for w in WORDS)
    html = f'<style>@font-face{{font-family:H;src:url(data:font/ttf;base64,{b64})}}body{{margin:24px;background:#fff;font-family:H;direction:rtl;width:1100px}}</style><body lang="dv">{rows}</body>'
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_page(viewport={"width": 1160, "height": 620})
        pg.set_content(html); pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(500)
        assert pg.evaluate("document.fonts.check('64px H')")
        pg.screenshot(path=str(OUT / "words.png"))
        b.close()
    print("BUILD FONT FLOW OK ->", OUT)


main()
