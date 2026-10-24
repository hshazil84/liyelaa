"""The marker: freehand drawing with a nib you choose. Needs web on :3000.
   python3 e2e/marker_flow.py"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
FIX = json.loads((Path(__file__).parent / "fixtures" / "tail-glyphs.json").read_text())
PUT = """(v) => new Promise((res) => { const r = indexedDB.open('keyval-store'); r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); const s = t.objectStore('keyval'); s.clear(); s.put(v, 'dfm.handwriting.v1'); t.oncomplete = () => res(true); }; })"""
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""


def to_screen(pg, fx, fy):
    svg = pg.get_by_test_id("editor-svg")
    vb = [float(v) for v in svg.get_attribute("data-vb").split()]
    b = svg.bounding_box()
    return b["x"] + (fx - vb[0]) / vb[2] * b["width"], b["y"] + (-fy - vb[1]) / vb[3] * b["height"]


def drag(pg, pts):
    xy = [to_screen(pg, x, y) for x, y in pts]
    pg.mouse.move(*xy[0]); pg.mouse.down()
    for p in xy[1:]:
        pg.mouse.move(*p, steps=4)
    pg.mouse.up(); pg.wait_for_timeout(450)


def box(g):
    xs = [s["p"]["x"] for c in g["contours"] for s in c]; ys = [s["p"]["y"] for c in g["contours"] for s in c]
    return min(xs), min(ys), max(xs), max(ys)


def tool(pg, name):
    return pg.get_by_test_id("editor").get_by_role("button", name=name, exact=True)


def glyph(pg, id):
    return pg.evaluate(READ)["glyphs"].get(id)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_page(viewport={"width": 1360, "height": 1000})
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "RSC payload" not in m.text else None)
        pg.goto(WEB)
        pg.evaluate("() => localStorage.clear()")
        pg.evaluate(PUT, {"v": 1, "glyphs": FIX, "updatedAt": 1, "title": "Marker test", "path": "draw"})
        pg.goto(f"{WEB}/handwriting/letters")
        pg.locator('[data-cell="0784"]').click()          # a letter with nothing drawn yet
        pg.wait_for_selector("[data-testid=editor-svg]")

        # the marker is first in the toolbar, selected for an empty letter, with its nib panel
        assert tool(pg, "Brush").get_attribute("aria-pressed") == "true"
        assert pg.get_by_test_id("marker-panel").is_visible()
        names = pg.get_by_test_id("editor").get_by_role("toolbar").locator("button").evaluate_all("els => els.map(e => e.innerText.trim())")
        assert names[:5] == ["Select", "Brush", "Pen", "Edit", "Erase"], names
        assert pg.get_by_test_id("nib-chisel").get_attribute("aria-checked") == "true"

        # a stroke with the round nib is an even line, one shape, saved
        pg.get_by_test_id("nib-round").click()
        assert pg.get_by_test_id("nib-angle").is_disabled(), "a round nib has no angle"
        pg.evaluate("document.querySelector('[data-testid=marker-more]').open = true"); pg.wait_for_timeout(900)   # the card glides into view after opening
        pg.get_by_test_id("nib-size").fill("76"); pg.get_by_test_id("nib-smooth").fill("0")
        drag(pg, [(120, 150), (200, 150), (300, 150), (400, 150)])
        g = glyph(pg, "0784")
        assert g and len(g["contours"]) == 1, g
        x0, y0, x1, y1 = box(g)
        assert 60 <= y1 - y0 <= 90 and x1 - x0 >= 330, (x1 - x0, y1 - y0)       # as thick as the nib, as long as the drag plus the nib
        assert g["adv"] >= x1 + 40 - 1, "the letter's width follows what was drawn"
        assert pg.locator('[data-cell="0784"]').get_attribute("data-status") == "traced"

        # a flat nib held level draws a thin line across and a thick one down
        pg.get_by_test_id("nib-chisel").click()
        pg.get_by_test_id("nib-angle").fill("0")
        before = len(glyph(pg, "0784")["contours"])
        drag(pg, [(150, -100), (250, -100), (350, -100)])
        g = glyph(pg, "0784")
        assert len(g["contours"]) == before + 1
        across = box({"contours": [g["contours"][-1]]}); thin = across[3] - across[1]
        drag(pg, [(450, -60), (450, -140), (450, -220)])
        down = box({"contours": [glyph(pg, "0784")["contours"][-1]]}); wide = down[2] - down[0]
        assert thin < 35 and wide > 45, ("chisel thin across, thick down", thin, wide)

        # undo takes back the last stroke only
        n = len(glyph(pg, "0784")["contours"])
        tool(pg, "Undo").click(); pg.wait_for_timeout(450)
        assert len(glyph(pg, "0784")["contours"]) == n - 1

        # a stroke across a drawn letter is a shape of its own and the letter is untouched; Unite joins them
        pg.reload(); pg.locator('[data-cell="0780"]').click(); pg.wait_for_selector("[data-testid=editor-svg]")
        old = glyph(pg, "0780"); ob = box(old)
        tool(pg, "Brush").click()
        pg.get_by_test_id("nib-round").click(); pg.get_by_test_id("nib-size").fill("90")
        mid = ((ob[0] + ob[2]) / 2, (ob[1] + ob[3]) / 2)
        drag(pg, [(mid[0] - 40, mid[1] + 60), (mid[0], mid[1]), (mid[0] + 40, mid[1] - 60)])
        new = glyph(pg, "0780")
        assert len(new["contours"]) == len(old["contours"]) + 1, "a touching stroke stays its own shape"
        assert new["contours"][: len(old["contours"])] == old["contours"], "the letter itself is untouched"

        # a stroke away from the letter is another new shape
        far = (ob[2] + 150, ob[1] + 60)
        drag(pg, [far, (far[0] + 60, far[1] + 80)])
        assert len(glyph(pg, "0780")["contours"]) == len(old["contours"]) + 2

        # the nib is remembered
        pg.evaluate("document.querySelector('[data-testid=marker-more]').open = true"); pg.wait_for_timeout(900)   # the card glides into view after opening
        pg.get_by_test_id("nib-taper").fill("60")
        pg.reload(); pg.locator('[data-cell="0780"]').click(); pg.wait_for_selector("[data-testid=editor-svg]")
        tool(pg, "Brush").click()
        assert pg.get_by_test_id("nib-taper").input_value() == "60" and pg.get_by_test_id("nib-round").get_attribute("aria-checked") == "true"

        # Escape cancels a stroke in progress
        sx, sy = to_screen(pg, 100, 300); ex, ey = to_screen(pg, 300, 320)
        cnt = len(glyph(pg, "0780")["contours"])
        pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(ex, ey, steps=5)
        assert pg.get_by_test_id("marker-live").count() == 1
        pg.keyboard.press("Escape"); pg.mouse.up(); pg.wait_for_timeout(450)
        assert len(glyph(pg, "0780")["contours"]) == cnt and pg.get_by_test_id("marker-live").count() == 0
        pg.screenshot(path=str(Path(__file__).parent / "out" / "marker.png"))

        # ink: a clean stroke is one smooth shape; a dry stroke is streaked, so it has far more points and gaps
        pg.locator('[data-cell="0784"]').click(); pg.wait_for_selector("[data-testid=editor-svg]")
        tool(pg, "Brush").click(); pg.get_by_test_id("ink-clean").click(); pg.get_by_test_id("nib-round").click(); pg.get_by_test_id("nib-size").fill("110")
        drag(pg, [(100, -100), (250, -60), (400, -100), (550, -60), (700, -100)])
        clean_pts = sum(len(c) for c in glyph(pg, "0784")["contours"])
        pg.get_by_test_id("ink-dry").click()
        assert pg.get_by_test_id("ink-dry").get_attribute("aria-checked") == "true"
        drag(pg, [(100, 100), (250, 140), (400, 100), (550, 140), (700, 100)])
        both = glyph(pg, "0784")["contours"]
        dry_pts = sum(len(c) for c in both) - clean_pts
        assert dry_pts > clean_pts * 3 and len(both) >= 3, (clean_pts, dry_pts, len(both))
        pg.get_by_test_id("ink-felt").click()
        pg.get_by_label("Undo").click(); pg.wait_for_timeout(300)
        assert pg.get_by_test_id("ink-felt").get_attribute("aria-checked") == "true"
        assert not errors, errors
        b.close()
    print("marker flow ok")


main()
