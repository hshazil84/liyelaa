"""Signs and punctuation, then joined letters, then a downloaded font that uses them.
Needs web on :3000 and the builder on :8000.   python3 e2e/extras_flow.py [output dir]"""
import io, json, os, sys, tempfile, zipfile
from pathlib import Path
from fontTools.ttLib import TTFont
from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
OUT.mkdir(parents=True, exist_ok=True)
WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""
SEED = """(p) => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); t.objectStore('keyval').put(p, 'dfm.handwriting.v1'); t.oncomplete = () => res(true); }; })"""


def seg(x, y):
    return {"p": {"x": x, "y": y}, "hi": {"x": 0, "y": 0}, "ho": {"x": 0, "y": 0}}


def box(x0, y0, x1, y1):
    return [[seg(x0, y0), seg(x1, y0), seg(x1, y1), seg(x0, y1)]]


def glyph(cp, kind="letter", w=60, h=300, adv=520):
    gid = f"{cp:04X}"
    return {"id": gid, "cp": [cp], "kind": kind, "contours": box(120, 0, 120 + w, h), "adv": adv, "source": "drawn", "checked": True}


def to_screen(pg, fx, fy):
    svg = pg.get_by_test_id("editor-svg")
    vb = [float(v) for v in svg.get_attribute("viewBox").split()]
    b = svg.bounding_box()
    s = min(b["width"] / vb[2], b["height"] / vb[3])
    ox = b["x"] + (b["width"] - vb[2] * s) / 2
    oy = b["y"] + (b["height"] - vb[3] * s) / 2
    return ox + (fx - vb[0]) * s, oy + (-fy - vb[1]) * s


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 1000}, accept_downloads=True)
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        pg.goto(f"{WEB}/handwriting/extras")
        letters = [glyph(0x0780 + i) for i in range(12)]
        marks = [glyph(0x07A6, "fili", 40, 120, 0), glyph(0x07A7, "fili", 40, 120, 0)]
        comma = glyph(0x060C, "symbol", 50, 120, 260)
        pg.evaluate(SEED, {"v": 1, "glyphs": {g["id"]: g for g in letters + marks + [comma]}, "updatedAt": 1, "path": "draw"})

        # ---- signs and punctuation
        pg.goto(f"{WEB}/handwriting/extras")
        pg.wait_for_selector('[data-cell="060C"]')
        pg.wait_for_timeout(400)
        assert pg.locator('[data-cell="060C"]').get_attribute("data-status") == "drawn"
        assert pg.locator('[data-cell="061B"]').get_attribute("data-status") == "missing"
        assert pg.get_by_test_id("progress").inner_text().startswith("1 of 27"), pg.get_by_test_id("progress").inner_text()
        # draw the semicolon with the pen
        pg.locator('[data-cell="061B"]').click()
        pg.wait_for_selector("[data-testid=editor-svg]")
        pg.get_by_test_id("editor").get_by_role("button", name="Shape", exact=True).click()
        for fx, fy in [(150, 0), (300, 0), (225, 250)]:
            pg.mouse.click(*to_screen(pg, fx, fy))
        pg.mouse.click(*to_screen(pg, 150, 0))
        pg.wait_for_timeout(500)
        proj = pg.evaluate(READ)
        assert len(proj["glyphs"]["061B"]["contours"]) == 1, proj["glyphs"].keys()
        # options persist
        pg.get_by_label("Flip quote marks for Thaana").uncheck()
        pg.get_by_label("Also keep the rufiyaa at a spare slot").check()
        pg.wait_for_timeout(500)
        ex = pg.evaluate(READ)["extras"]
        assert ex == {"latinPunctuation": True, "rtlQuotes": False, "rufiyaaPrivateUse": True}, ex
        pg.screenshot(path=str(OUT / "extras.png"))
        pg.reload()
        pg.wait_for_selector('[data-cell="061B"]')
        assert pg.get_by_label("Flip quote marks for Thaana").is_checked() is False
        assert pg.locator('[data-cell="061B"]').get_attribute("data-status") == "drawn"

        # ---- joined letters
        pg.get_by_test_id("continue-ligatures").click()
        pg.wait_for_url("**/handwriting/ligatures")
        pg.get_by_test_id("common").wait_for()
        pg.locator('[data-mode="own"]').click()
        pg.get_by_test_id("add-lig").is_disabled()
        pg.locator('[data-pick="0780"]').click()
        pg.locator('[data-pick="0781"]').click()
        assert pg.get_by_test_id("sequence").inner_text() == "ހށ", pg.get_by_test_id("sequence").inner_text()
        pg.get_by_label("Only at the end of a word").check()
        pg.get_by_test_id("add-lig").click()
        pg.wait_for_selector("[data-lig=lig1]")
        assert pg.locator("[data-lig=lig1]").get_attribute("data-status") == "missing"
        # the preview shows the plain letters until the joined shape is drawn
        pg.get_by_test_id("editor").get_by_role("button", name="Shape", exact=True).click()
        for fx, fy in [(100, 0), (700, 0), (400, 300)]:
            pg.mouse.click(*to_screen(pg, fx, fy))
        pg.mouse.click(*to_screen(pg, 100, 0))
        pg.wait_for_timeout(500)
        lig = pg.evaluate(READ)["ligatures"][0]
        assert lig["sequence"] == [0x780, 0x781] and lig["when"] == "end" and len(lig["glyph"]["contours"]) == 1, lig
        assert pg.locator("[data-lig=lig1]").get_attribute("data-status") == "drawn"
        # the joined preview is a different width from the apart preview
        joined, apart = pg.get_by_test_id("word").nth(0), pg.get_by_test_id("word").nth(1)
        assert abs(joined.bounding_box()["width"] - apart.bounding_box()["width"]) > 2, "joined and apart differ"
        pg.screenshot(path=str(OUT / "ligatures.png"))
        pg.reload()
        pg.wait_for_selector("[data-lig=lig1]")
        assert pg.locator("[data-lig=lig1]").get_attribute("data-status") == "drawn"

        # ---- the built font
        pg.get_by_test_id("continue-export").click()
        pg.wait_for_url("**/handwriting/export")
        pg.wait_for_selector("[data-testid=test-area][data-preview-state=ready]", timeout=60000)
        assert "1 joined shape" in pg.get_by_test_id("checks").inner_text()
        with pg.expect_download() as dl:
            pg.get_by_test_id("download-zip").click()
        z = zipfile.ZipFile(dl.value.path())
        ttf = [n for n in z.namelist() if n.endswith(".ttf")][0]
        f = TTFont(io.BytesIO(z.read(ttf)))
        assert "lig_lig1" in f.getGlyphOrder(), f.getGlyphOrder()[:10]
        cmap = f.getBestCmap()
        assert cmap[0x2C] == cmap[0x060C] and cmap[0x3B] == cmap[0x061B], "typed , ; map to the drawn marks"
        assert 0xE000 not in cmap, "no rufiyaa was drawn, so no private-use slot"
        feats = {r.FeatureTag for r in f["GSUB"].table.FeatureList.FeatureRecord}
        assert "calt" in feats, feats
        assert "rtlm" not in feats, "quote swap was switched off"
        assert not errors, errors
        print("extras flow ok")
        b.close()


main()
