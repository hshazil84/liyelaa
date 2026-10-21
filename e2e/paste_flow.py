"""Paste Illustrator-style SVG (a stroke, no xmlns) into the editor, and drop a file on it. Needs web on :3000.   python3 e2e/paste_flow.py [output dir]"""
import os, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
OUT.mkdir(parents=True, exist_ok=True)
WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""
PASTE = """(text) => { const dt = new DataTransfer(); dt.setData('text/plain', text);
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }"""

# a looped handwriting stroke like the Illustrator screenshot: no fill, 6pt black stroke, self-crossing, no xmlns
STROKE = ('<svg id="Layer_1" viewBox="0 0 900 700"><defs><style>.cls-1{fill:none;stroke:#000;stroke-miterlimit:10;stroke-width:6px;}</style></defs>'
          '<path class="cls-1" d="M40 640 C 200 520 330 360 390 250 C 420 180 450 120 400 130 C 360 140 380 300 440 280 C 520 250 560 160 600 140 C 610 250 600 330 640 320 C 700 300 720 200 735 100"/></svg>')
# Illustrator crops the artboard to the artwork, so a filled letter with curves fills the whole viewBox
TIGHT = ('<?xml version="1.0" encoding="UTF-8"?><svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 153.73 121.46"><defs><style>.cls-1{fill:#231f20;}</style></defs>'
         '<path class="cls-1" d="M148.73,2.41c.13,9.35-3.17,18.71-9.1,25.95-3.03,3.7-6.69,6.98-10.9,9.4-30,17.3-80,40-120,80.7,4-8,20-30,45-50,40-30,80-50,95-66Z"/></svg>')
FILLED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 90 L50 10 L90 90 Z"/></svg>'


def bbox(g):
    xs = [s["p"]["x"] for c in g["contours"] for s in c]
    ys = [s["p"]["y"] for c in g["contours"] for s in c]
    return min(xs), max(xs), min(ys), max(ys)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 1000}).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.goto(f"{WEB}/handwriting")
        pg.evaluate("""() => new Promise((res) => { const r = indexedDB.open('keyval-store'); r.onupgradeneeded = () => r.result.createObjectStore('keyval');
          r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); t.objectStore('keyval').put({ v: 1, glyphs: {}, updatedAt: 1, path: 'draw' }, 'dfm.handwriting.v1'); t.oncomplete = () => res(true); }; })""")
        pg.goto(f"{WEB}/handwriting/letters")
        pg.wait_for_selector("[data-testid=editor-svg]")
        # something that is not SVG gets a plain explanation
        pg.evaluate(PASTE, "just some words")
        pg.wait_for_selector("[data-testid=paste-notice]")
        assert "Include SVG Code" in pg.get_by_test_id("paste-notice").inner_text()
        assert pg.evaluate(READ)["glyphs"] == {}

        # the stroke becomes a filled outline of the letter's usual height, on the baseline
        pg.evaluate(PASTE, STROKE)
        pg.wait_for_function("() => document.querySelector('[data-testid=paste-notice]')?.textContent?.includes('Pasted')")
        pg.wait_for_timeout(600)
        g = pg.evaluate(READ)["glyphs"]["0780"]
        x0, x1, y0, y1 = bbox(g)
        assert g["contours"] and g["source"] == "drawn"
        assert 240 < (y1 - y0) < 340, (y0, y1)           # reference height of U+0780 is 292, plus a little for rounding
        assert 35 < x0 < 45, x0                           # left space
        assert g["adv"] > x1, (g["adv"], x1)
        assert len(g["contours"]) <= 3, len(g["contours"])
        pg.screenshot(path=str(OUT / "paste-1.png"))

        # a filled shape works too, and Undo brings back the first one
        pg.evaluate(PASTE, FILLED)
        pg.wait_for_timeout(600)
        t = pg.evaluate(READ)["glyphs"]["0780"]
        assert len(t["contours"]) == 1 and len(t["contours"][0]) == 3, t["contours"]
        pg.get_by_label("Undo").click()
        pg.wait_for_timeout(600)
        assert bbox(pg.evaluate(READ)["glyphs"]["0780"]) == bbox(g)

        # a letter that fills a tight artboard is kept, not mistaken for a background
        pg.evaluate(PASTE, TIGHT)
        pg.wait_for_timeout(600)
        t = pg.evaluate(READ)["glyphs"]["0780"]
        assert t["contours"] and len(t["contours"][0]) > 3, t["contours"]
        assert pg.get_by_test_id("paste-notice").inner_text().startswith("Pasted"), pg.get_by_test_id("paste-notice").inner_text()
        pg.get_by_label("Undo").click()
        pg.wait_for_timeout(600)

        # the Draw or import page takes a direct paste too
        pg.goto(f"{WEB}/draw")
        pg.wait_for_selector("[data-testid=open-blank]")
        pg.evaluate(PASTE, "not svg at all")
        pg.wait_for_selector("[data-testid=import-error]")
        assert "Include SVG Code" in pg.get_by_test_id("import-error").inner_text()
        pg.evaluate(PASTE, STROKE)
        pg.wait_for_selector("[data-testid=stroke-notice]")
        pg.get_by_test_id("outline-strokes").click()
        pg.wait_for_selector("[data-testid=use-letters]:not([disabled])")
        # a wrongly pasted letter can be taken out again, and pasted back
        pg.get_by_test_id("remove-0780").click()
        pg.wait_for_selector("[data-testid=use-letters][disabled]")
        assert pg.locator("[data-cell='0780'][data-status=ok]").count() == 0
        pg.evaluate(PASTE, STROKE)
        pg.wait_for_selector("[data-cell='0780'][data-status=ok]")
        pg.wait_for_selector("[data-testid=use-letters]:not([disabled])")
        pg.get_by_test_id("use-letters").click()
        pg.wait_for_selector("[data-testid=import-saved]")
        saved = pg.evaluate(READ)["glyphs"]["0780"]
        assert saved["contours"] and saved["source"] == "drawn"
        assert not errors, errors
        print("paste flow ok")
        b.close()


main()
