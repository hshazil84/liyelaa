"""Run the synthetic phone photos through the Photo page and check what comes out.
Needs the web app on :3000.   python3 e2e/handwriting_flow.py <dir with the synthetic photos>"""
import json, os, statistics, sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = Path(sys.argv[1])
WEB = os.environ.get("WEB_URL", "http://localhost:3000")
TRUTH = json.loads((PHOTOS / "truth.json").read_text())
F_MM, WGHT, STROKE_MM, UNITS = 26, 520, 0.25, 38
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None

# expected size of each letter, from the font the fake handwriting was drawn with
VAR = TTFont(str(ROOT / "builder/assets/NotoSansThaana-Variable.ttf"))
STATIC = instancer.instantiateVariableFont(VAR, {"wght": WGHT}, inplace=False)
CMAP, GLYF, HMTX = STATIC.getBestCmap(), STATIC["glyf"], STATIC["hmtx"]


def expected_box(cp):
    g = GLYF[CMAP[cp]]
    g.recalcBounds(GLYF)
    k = F_MM / 1000 * UNITS
    pad = STROKE_MM * UNITS
    return (g.xMax - g.xMin) * k + pad, g.yMin * k - pad / 2, g.yMax * k + pad / 2


def read_project(page):
    return page.evaluate("""() => new Promise((res) => {
      const r = indexedDB.open('keyval-store');
      r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); };
    })""")


def bbox(glyph):
    xs, ys = [], []
    for c in glyph["contours"]:
        for s in c:
            xs.append(s["p"]["x"]); ys.append(s["p"]["y"])
    return min(xs), max(xs), min(ys), max(ys)


def run_photo(pg, name, sheet, results):
    pg.goto(f"{WEB}/handwriting")
    pg.get_by_text("Sheet 1 · Letters" if sheet == 1 else "Sheet 2 · Marks").click()
    pg.get_by_test_id("photo-input").set_input_files(str(PHOTOS / name))
    try:
        pg.wait_for_selector("[data-testid=summary], [data-testid=photo-error]", timeout=60000)
    except Exception:
        print(f"{name}: timed out"); return False
    if pg.get_by_test_id("photo-error").count():
        print(f"{name}: ERROR shown -> {pg.get_by_test_id('photo-error').inner_text()}"); return False
    tiles = pg.locator("li[data-cell]")
    got = {tiles.nth(i).get_attribute("data-cell"): tiles.nth(i).get_attribute("data-status") for i in range(tiles.count())}
    edge = {tiles.nth(i).get_attribute("data-cell") for i in range(tiles.count()) if "touching" in (tiles.nth(i).get_attribute("title") or "").lower() or "edge" in (tiles.nth(i).get_attribute("title") or "").lower()}
    t = TRUTH[str(sheet)]
    bad = []
    for cid, want in t.items():
        have = got.get(cid)
        if want == "ok+edge":
            if have != "ok" or cid not in edge: bad.append((cid, want, have, cid in edge))
        elif have != want:
            bad.append((cid, want, have))
    print(f"{name}: {sum(v=='ok' for v in got.values())} ok, {sum(v=='light' for v in got.values())} light, "
          f"{sum(v=='empty' for v in got.values())} empty, edge={sorted(edge)}  summary: {pg.get_by_test_id('summary').inner_text().replace(chr(10),' | ')}")
    stray = sorted(edge - {cid for cid, w in t.items() if w == "ok+edge"})
    if stray: bad.append(("unexpected edge warnings", stray))
    if bad: print("   MISMATCH:", bad)
    results.append((name, sheet, not bad))
    pg.get_by_test_id("use-letters").click()
    pg.wait_for_selector("[data-testid=saved-summary]")
    return not bad


def main():
    results = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        # each orientation on a clean slate, so a failure in one cannot hide behind another
        for name, sheet in (("sheet1_tilt.jpg", 1), ("sheet1_sideways.jpg", 1), ("sheet1_upside.jpg", 1), ("sheet2_tilt.jpg", 2)):
            run_photo(pg, name, sheet, results)
        pg.screenshot(path=str(PHOTOS / "result-page.png"))
        print("saved:", pg.get_by_test_id("saved-summary").inner_text().replace("\n", " | "))
        proj = read_project(pg)
        # how close are the traced shapes to the letters that were drawn?
        errs_w, errs_top, errs_bot = [], [], []
        for gid, g in proj["glyphs"].items():
            cp = g["cp"][0]
            if g["kind"] != "letter" or gid in ("0786", "0795") or cp not in CMAP: continue
            w, ymin, ymax = expected_box(cp)
            x0, x1, y0, y1 = bbox(g)
            errs_w.append(abs((x1 - x0) - w)); errs_top.append(abs(y1 - ymax)); errs_bot.append(abs(y0 - ymin))
        n = len(errs_w)
        print(f"shape check over {n} letters (font units, 1mm = 38): width error median {statistics.median(errs_w):.0f} max {max(errs_w):.0f};"
              f" top median {statistics.median(errs_top):.0f} max {max(errs_top):.0f}; bottom median {statistics.median(errs_bot):.0f} max {max(errs_bot):.0f}")
        sizes = [sum(len(c) for c in g["contours"]) for g in proj["glyphs"].values()]
        print(f"nodes per glyph: median {statistics.median(sizes):.0f}, max {max(sizes)}")
        b.close()
        assert statistics.median(errs_w) < 25 and statistics.median(errs_top) < 25 and statistics.median(errs_bot) < 25, "traced shapes are off"
        assert max(errs_w) < 90 and max(errs_top) < 90 and max(errs_bot) < 90, "a traced shape is badly off"
        assert not errors, errors
        assert all(ok for _, _, ok in results), results
    print("HANDWRITING FLOW OK")


main()
