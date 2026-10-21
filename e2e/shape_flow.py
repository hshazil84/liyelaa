"""Shape sliders in the clean-up editor: preview, apply, undo. Needs web on :3000.   python3 e2e/shape_flow.py [output dir]"""
import math, os, sys, tempfile
from pathlib import Path
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


def traced(n=70):
    """A wobbly upright oval, like a photo trace: many points, no handles."""
    pts = []
    for i in range(n):
        a = i / n * math.pi * 2
        w = math.sin(i * 7) * 4
        pts.append({"p": {"x": 300 + (100 + w) * math.cos(a), "y": 200 + (180 + w) * math.sin(a)}, "hi": {"x": 0, "y": 0}, "ho": {"x": 0, "y": 0}})
    return [pts]


def bbox(g):
    xs = [s["p"]["x"] for c in g["contours"] for s in c]
    ys = [s["p"]["y"] for c in g["contours"] for s in c]
    return min(xs), max(xs), min(ys), max(ys)


def slide(pg, id_, value):
    pg.locator(f"#shape-{id_}").fill(str(value))
    pg.wait_for_timeout(120)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 1000}).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        pg.goto(f"{WEB}/handwriting")
        g = {"id": "0780", "cp": [0x780], "kind": "letter", "contours": traced(), "adv": 520, "source": "photo", "checked": False}
        pg.evaluate(SEED, {"v": 1, "glyphs": {"0780": g}, "updatedAt": 1, "path": "photo"})
        pg.goto(f"{WEB}/handwriting/letters")
        pg.wait_for_selector("[data-testid=shape-panel]")
        pg.wait_for_selector("[data-node='0-69']")
        start = pg.evaluate(READ)["glyphs"]["0780"]
        w0 = bbox(start)
        assert len(start["contours"][0]) == 70
        pg.screenshot(path=str(OUT / "shape-1.png"))

        # a slider only previews: the saved letter does not change until Apply
        slide(pg, "weight", 30)
        assert pg.get_by_test_id("shape-weight-value").inner_text() == "+30"
        assert pg.locator("[data-node]").count() == 0, "points are hidden while previewing"
        assert pg.evaluate(READ)["glyphs"]["0780"]["contours"] == start["contours"]
        pg.get_by_test_id("shape-reset").click()
        assert pg.locator("#shape-weight").input_value() == "0"
        assert pg.locator("[data-node]").count() == 70, "points return after Reset"

        # bolder grows the ink, thinner shrinks it
        slide(pg, "weight", 30)
        pg.get_by_test_id("shape-apply").click()
        pg.wait_for_timeout(500)
        bold = pg.evaluate(READ)["glyphs"]["0780"]
        w1 = bbox(bold)
        assert (w1[1] - w1[0]) > (w0[1] - w0[0]) + 25, (w0, w1)
        assert len(bold["contours"][0]) < 70, "offset result uses fewer points"
        assert pg.locator("#shape-weight").input_value() == "0", "sliders return to the middle after Apply"

        # smooth drops points
        slide(pg, "smooth", 70)
        pg.get_by_test_id("shape-apply").click()
        pg.wait_for_timeout(500)
        sm = pg.evaluate(READ)["glyphs"]["0780"]
        assert len(sm["contours"][0]) <= 16, len(sm["contours"][0])

        # slant, size, flip together; the ink moves the way the sliders say
        before = bbox(sm)
        slide(pg, "slant", 20); slide(pg, "size", 150)
        pg.get_by_role("button", name="Flip sideways").click()
        pg.screenshot(path=str(OUT / "shape-2.png"))
        pg.get_by_test_id("shape-apply").click()
        pg.wait_for_timeout(500)
        after = bbox(pg.evaluate(READ)["glyphs"]["0780"])
        assert (after[3] - after[2]) > (before[3] - before[2]) * 1.4, (before, after)

        # Undo goes back one Apply at a time
        pg.get_by_label("Undo").click()
        pg.wait_for_timeout(500)
        back = bbox(pg.evaluate(READ)["glyphs"]["0780"])
        assert abs(back[3] - back[2] - (before[3] - before[2])) < 1, (back, before)
        pg.get_by_label("Undo").click(); pg.get_by_label("Undo").click()
        pg.wait_for_timeout(500)
        assert pg.evaluate(READ)["glyphs"]["0780"]["contours"] == start["contours"], "two more undos return the traced letter"
        assert not errors, errors
        print("shape flow ok")
        b.close()


main()
