"""English letters through the SVG import: files named upper-A / lower-g are matched, sized to Inter's heights and
put on the baseline (g drops below it), and one stray name is reported.
Needs web on :3000.   python3 e2e/import_latin_flow.py [output dir]"""
import os, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
OUT.mkdir(parents=True, exist_ok=True)
WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""
# Inter, in template units: A reaches 494; g runs from -147 to 376; x from 0 to 371
WANT = {"0041": (0, 494), "0067": (-147, 376), "0078": (0, 371)}


def box(x0, y0, x1, y1):
    """A rounded-ish four point shape, drawn y down on a 400 unit artboard, at any size."""
    cx, cy, rx, ry, k = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0.5523
    f = lambda v: round(v, 2)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><path d="'
            f'M{f(cx-rx)} {f(cy)} C{f(cx-rx)} {f(cy-k*ry)} {f(cx-k*rx)} {f(cy-ry)} {f(cx)} {f(cy-ry)} '
            f'C{f(cx+k*rx)} {f(cy-ry)} {f(cx+rx)} {f(cy-k*ry)} {f(cx+rx)} {f(cy)} '
            f'C{f(cx+rx)} {f(cy+k*ry)} {f(cx+k*rx)} {f(cy+ry)} {f(cx)} {f(cy+ry)} '
            f'C{f(cx-k*rx)} {f(cy+ry)} {f(cx-rx)} {f(cy+k*ry)} {f(cx-rx)} {f(cy)} Z" fill="#000"/></svg>')


def main():
    d = OUT / "svgs"; d.mkdir(exist_ok=True)
    # drawn at an unrelated size: the importer has to bring them to Inter's heights
    # a set drawn at half size with Inter's proportions, baseline at y 300: the set keeps its relative heights
    files = {"upper-A.svg": box(100, 53, 260, 300), "lower-g.svg": box(100, 112, 220, 373.5), "lower-x.svg": box(100, 114.5, 230, 300),
             "hello.svg": box(100, 60, 260, 300)}
    (d / "lower-p.svg").write_text(box(100, 100, 200, 390))     # on its own, any size: fitted to its own reference
    for n, t in files.items(): (d / n).write_text(t)

    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1500, "height": 1200})
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"{WEB}/draw")
        pg.evaluate("() => localStorage.setItem('thaanafont.intro-seen','1')")
        pg.get_by_test_id("svg-input").set_input_files([str(d / n) for n in files])
        pg.get_by_test_id("unmatched").wait_for(timeout=30000)
        assert "hello.svg" in pg.get_by_test_id("unmatched").inner_text()
        pg.get_by_test_id("set-english").click()
        pg.wait_for_selector("[data-cell='0041'][data-status=ok]", timeout=30000)
        ok = pg.locator("[data-cell][data-status=ok]").count()
        assert ok == 3, ok
        assert pg.locator("[data-cell]").count() == 52, pg.locator("[data-cell]").count()
        assert "3" in pg.get_by_test_id("set-english").inner_text()
        pg.screenshot(path=str(OUT / "latin-1.png"), full_page=True)

        pg.get_by_test_id("use-letters").click()
        pg.wait_for_selector("[data-testid=import-saved]")
        gs = pg.evaluate(READ)["glyphs"]
        for cid, (lo, hi) in WANT.items():
            g = gs[cid]
            ys = [pt["p"]["y"] for c in g["contours"] for pt in c]
            xs = [pt["p"]["x"] for c in g["contours"] for pt in c]
            print(cid, "ink", round(min(ys)), round(max(ys)), "want", lo, hi)
            assert abs(min(ys) - lo) < 12 and abs(max(ys) - hi) < 12, (cid, min(ys), max(ys))
            assert abs(min(xs) - 40) < 1.5, (cid, min(xs))
            assert g["kind"] == "latin" and g["source"] == "drawn", g["kind"]
        # one letter alone is fitted to its own reference height whatever size it was drawn
        pg2 = ctx.new_page()
        pg2.goto(f"{WEB}/draw")
        pg2.evaluate("() => localStorage.setItem('thaanafont.intro-seen','1')")
        pg2.get_by_text("Start over").click()
        pg2.get_by_test_id("svg-input").set_input_files([str(d / "lower-p.svg")])
        pg2.get_by_test_id("set-english").click()
        pg2.wait_for_selector("[data-cell='0070'][data-status=ok]", timeout=30000)
        pg2.get_by_test_id("use-letters").click()
        pg2.wait_for_selector("[data-testid=import-saved]")
        g = pg2.evaluate(READ)["glyphs"]["0070"]
        ys = [pt["p"]["y"] for c in g["contours"] for pt in c]
        print("0070 alone", round(min(ys)), round(max(ys)), "want -139 376")
        assert abs(min(ys) + 139) < 12 and abs(max(ys) - 376) < 12, (min(ys), max(ys))
        assert not errors, errors
        b.close()
    print("import latin flow ok")


main()
