"""Shapes stay separate: pick one, move one, rectangle-pick, and Unite / Minus / Intersect / Exclude / Divide, arrange, delete.
Needs web on :3000.   python3 e2e/combine_flow.py"""
import os
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
SEED = """(p) => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); t.objectStore('keyval').put(p, 'dfm.handwriting.v1'); t.oncomplete = () => res(true); }; })"""
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 1100}).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"{WEB}/handwriting")
        pg.evaluate(SEED, {"v": 1, "glyphs": {}, "updatedAt": 1, "path": "draw"})
        pg.goto(f"{WEB}/handwriting/letters")
        pg.wait_for_selector("[data-testid=editor]")
        ed = pg.get_by_test_id("editor")
        svg = pg.locator("[data-testid=editor] svg.touch-none").first
        # the page can scroll when a button low in the panel is pressed, so the board is measured each time
        P = lambda fx, fy: (lambda bx: (bx["x"] + bx["width"] * fx, bx["y"] + bx["height"] * fy))(svg.bounding_box())
        tool = lambda n: ed.get_by_role("button", name=n, exact=True)

        def contours():
            pg.wait_for_timeout(500)
            g = (pg.evaluate(READ) or {"glyphs": {}})["glyphs"].get("0780")
            return g["contours"] if g else []

        def drag(a, c, steps=8):
            pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(*c, steps=steps); pg.mouse.up(); pg.wait_for_timeout(200)

        def count():
            return pg.get_by_test_id("pick-count").inner_text()

        def centre(c):
            xs = [s["p"]["x"] for s in c]; ys = [s["p"]["y"] for s in c]
            return (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2

        # two crossing brush strokes are two shapes, and the new one is picked
        tool("Brush").click()
        pg.get_by_test_id("nib-round").click()
        pg.get_by_test_id("nib-size").evaluate("(el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); }", 90)
        drag(P(0.3, 0.45), P(0.7, 0.45)); drag(P(0.5, 0.25), P(0.5, 0.7))
        assert len(contours()) == 2, "each stroke is its own shape"
        tool("Select").click()
        assert count() == "1 shape picked.", count()
        assert pg.locator("[data-testid=select-box]").count() == 1

        # Ctrl+A picks both; the box grows
        ed.focus(); pg.keyboard.press("Control+a")
        assert count() == "2 shapes picked.", count()

        # Unite: one shape. Undo: two again
        pg.get_by_test_id("combine-unite").click()
        assert len(contours()) == 1 and count() == "1 shape picked.", "unite joined them"
        ed.focus(); pg.keyboard.press("Control+z")
        assert len(contours()) == 2, "undo splits them again"

        # click one stroke: only it is picked, and dragging moves only it
        before = contours()
        pg.mouse.click(*P(0.36, 0.45)); pg.wait_for_timeout(200)
        assert count() == "1 shape picked.", count()
        a = P(0.36, 0.45)
        drag(a, (a[0] - 30, a[1] + 40))
        after = contours()
        moved = [centre(x) != centre(y) for x, y in zip(before, after)]
        assert moved.count(True) == 1 and moved.count(False) == 1, f"one moved, one stayed: {moved}"
        ed.focus(); pg.keyboard.press("Control+z")

        # Shift+click adds a shape to the picked ones, and takes it off again
        pg.mouse.click(*P(0.36, 0.45)); pg.wait_for_timeout(200)
        pg.keyboard.down("Shift"); pg.mouse.click(*P(0.5, 0.3)); pg.keyboard.up("Shift"); pg.wait_for_timeout(200)
        assert count() == "2 shapes picked.", "shift adds: " + count()
        pg.keyboard.down("Shift"); pg.mouse.click(*P(0.5, 0.3)); pg.keyboard.up("Shift"); pg.wait_for_timeout(200)
        assert count() == "1 shape picked.", "shift takes off: " + count()

        # a rectangle picks what it touches, and empty space puts it down
        drag(P(0.1, 0.1), P(0.9, 0.9))
        assert count() == "2 shapes picked.", count()
        pg.mouse.click(*P(0.9, 0.95)); pg.wait_for_timeout(200)
        assert count() == "Click a shape to pick it. Shift+click picks more.", count()

        def op(name, want, label):
            ed.focus(); pg.keyboard.press("Control+a")
            pg.get_by_test_id(f"combine-{name}").click()
            n = len(contours())
            assert n == want or (want < 0 and n >= -want), f"{label}: {n} outlines, wanted {want}"
            ed.focus(); pg.keyboard.press("Control+z")
            assert len(contours()) == 2

        op("intersect", 1, "intersect keeps the overlap")
        op("minusFront", 2, "minus front cuts the first stroke in two")
        op("minusBack", 2, "minus back cuts the second stroke in two")
        op("exclude", -2, "exclude leaves the arms of the cross, touching only at corners")
        op("divide", 5, "divide cuts the cross into five pieces")

        # arrange: bring the first to front swaps the order
        first = contours()[0]
        pg.mouse.click(*P(0.36, 0.45)); pg.wait_for_timeout(200)
        pg.get_by_test_id("arrange-front").click()
        assert contours()[1] == first, "bring to front moves it last"

        # duplicate then delete
        pg.get_by_test_id("arrange-copy").click()
        assert len(contours()) == 3, "duplicate adds one"
        pg.get_by_test_id("arrange-delete").click()
        assert len(contours()) == 2, "delete takes the picked one"
        assert not errors, errors
        print("combine flow ok")
        b.close()


main()
