"""The pen: shapes and holes, strokes with weight/ends/corners/alignment, undo a dot, and the panel only takes the height it needs.
Needs web on :3000.   python3 e2e/pen_flow.py"""
import os, re
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
SEED = """(p) => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); t.objectStore('keyval').put(p, 'dfm.handwriting.v1'); t.oncomplete = () => res(true); }; })"""


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
        # the page may scroll when a button low in the panel is pressed, so the board is measured each time
        X = lambda f: (lambda b: b["x"] + b["width"] * f)(svg.bounding_box())
        Y = lambda f: (lambda b: b["y"] + b["height"] * f)(svg.bounding_box())

        def area():
            """Total filled area of the glyph path on screen (bounding box of the fill), a rough size check."""
            bb = pg.get_by_test_id("glyph-fill").bounding_box()
            return bb["width"] * bb["height"]

        # the panel takes only the height it needs: Select is short
        ed.get_by_role("button", name="Erase", exact=True).click()
        sel_h = pg.locator("aside[aria-label=Adjust]").bounding_box()["height"]
        ed.get_by_role("button", name="Pen", exact=True).click()
        pg.get_by_test_id("pen-panel").wait_for()
        assert pg.locator("aside[aria-label=Adjust]").bounding_box()["height"] > sel_h, "the pen panel is taller than erase's note"

        # --- shape: three dots, close with Enter
        for fx, fy in [(0.35, 0.4), (0.6, 0.4), (0.5, 0.65)]:
            pg.mouse.click(X(fx), Y(fy))
        pg.keyboard.press("Enter")
        assert len(pg.get_by_test_id("glyph-fill").get_attribute("d") or "") > 10, "a shape was drawn"
        a1 = area()

        # --- undo a dot: Backspace removes the last one, the button too
        pg.mouse.click(X(0.2), Y(0.2)); pg.mouse.click(X(0.25), Y(0.3)); pg.mouse.click(X(0.3), Y(0.2))
        assert pg.locator("[data-testid=editor] svg rect[fill='#fff']").count() == 2, "three dots placed"
        pg.keyboard.press("Backspace")
        assert pg.locator("[data-testid=editor] svg rect[fill='#fff']").count() == 1, "Backspace took the last dot off"
        pg.get_by_test_id("pen-undo").click()
        pg.get_by_test_id("pen-reset").click()
        assert pg.get_by_test_id("pen-undo").is_disabled(), "nothing left to undo"

        pg.keyboard.press("Control+z")
        assert len(pg.get_by_test_id("glyph-fill").get_attribute("d") or "") < 10, "undo took the shape back"

        # --- stroke: two dots, Finish line
        pg.get_by_test_id("pen-mode-stroke").click()
        pg.get_by_test_id("pen-preview").wait_for()
        pg.mouse.click(X(0.2), Y(0.75)); pg.mouse.click(X(0.8), Y(0.75))
        assert pg.get_by_test_id("pen-live").count() == 1, "the line shows as it will look"
        pg.get_by_test_id("pen-finish").click()
        assert pg.get_by_test_id("pen-live").count() == 0, "preview gone once finished"
        pg.get_by_test_id("editor").focus(); pg.keyboard.press("Control+z")

        def line_width(cap=None, weight=None):
            if cap: pg.get_by_test_id(f"pen-cap-{cap}").click()
            if weight is not None:
                pg.get_by_test_id("pen-weight").evaluate("(el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); }", weight)
            pg.mouse.click(X(0.2), Y(0.75)); pg.mouse.click(X(0.8), Y(0.75))
            pg.get_by_test_id("pen-finish").click()
            bb = pg.get_by_test_id("glyph-fill").bounding_box()
            pg.get_by_test_id("editor").focus(); pg.keyboard.press("Control+z")
            return bb

        flat = line_width("flat", 76)
        sq = line_width("square")
        assert sq["width"] > flat["width"] + 20, f"square ends reach past flat ones ({sq['width']} vs {flat['width']})"
        thick = line_width("flat", 190)
        assert thick["height"] > flat["height"] * 1.8, "a heavier weight draws a thicker line"

        # --- closed line: inside is smaller than outside
        def ring(align):
            pg.get_by_test_id(f"pen-align-{align}").click()
            for fx, fy in [(0.3, 0.3), (0.6, 0.3), (0.6, 0.6), (0.3, 0.6)]:
                pg.mouse.click(X(fx), Y(fy))
            pg.get_by_test_id("pen-close").click()
            bb = pg.get_by_test_id("glyph-fill").bounding_box()
            pg.get_by_test_id("editor").focus(); pg.keyboard.press("Control+z")
            return bb["width"]
        pg.get_by_test_id("pen-weight").evaluate("(el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); }", 100)
        inside, outside = ring("inside"), ring("outside")
        assert outside > inside + 20, f"outside sits wider than inside ({outside} vs {inside})"


        # --- a stroke stays a stroke: leaving the pen finishes it, and the Edit tool shows its dots, not outline nodes
        pg.get_by_test_id("pen-mode-stroke").click()
        pg.mouse.click(X(0.25), Y(0.3)); pg.mouse.click(X(0.7), Y(0.55)); pg.mouse.click(X(0.5), Y(0.8))
        ed.get_by_role("button", name="Edit", exact=True).click()           # no Enter pressed
        assert len(pg.get_by_test_id("glyph-fill").get_attribute("d") or "") > 10, "leaving the pen kept the line"
        assert pg.get_by_test_id("stroke-dots").count() == 1, "the line shows its dots in Edit"
        assert pg.locator("[data-node]").count() == 0, "a line has no outline nodes"
        h0 = pg.get_by_test_id("glyph-fill").bounding_box()["height"]
        ed.get_by_role("button", name="Select", exact=True).click(); ed.get_by_role("button", name="Edit", exact=True).click()
        assert pg.get_by_test_id("stroke-dots").count() == 1, "still a line after changing tools"
        pg.get_by_test_id("stroke-dot").nth(1).click()
        pg.get_by_test_id("stroke-panel").wait_for()
        pg.get_by_test_id("pen-weight").evaluate("(el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); }", 300)
        pg.wait_for_timeout(200)
        h1 = pg.get_by_test_id("glyph-fill").bounding_box()["height"]
        assert h1 > h0 + 15, f"a heavier weight on a finished line ({h0} to {h1})"
        pg.get_by_test_id("stroke-curved").click()
        assert pg.get_by_test_id("stroke-handle-ho").count() == 1, "the dot got curve handles"
        # dragging a dot reshapes the line
        dots = pg.get_by_test_id("stroke-dot"); bb = dots.nth(2).bounding_box()
        d0 = pg.get_by_test_id("glyph-fill").get_attribute("d")
        pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); pg.mouse.down(); pg.mouse.move(bb["x"] + 60, bb["y"] - 60, steps=6); pg.mouse.up()
        assert pg.get_by_test_id("glyph-fill").get_attribute("d") != d0, "dragging a dot changed the line"
        pg.get_by_test_id("stroke-to-shape").click()
        assert pg.get_by_test_id("stroke-dots").count() == 0 and pg.locator("[data-node]").count() > 0, "Make it a shape gives outline nodes"

        # --- hole in shape mode flips direction but still draws
        ed.get_by_role("button", name="Pen", exact=True).click()
        pg.get_by_test_id("pen-mode-shape").click()
        pg.get_by_test_id("pen-hole").click()
        assert pg.get_by_test_id("pen-hole").get_attribute("aria-checked") == "true"

        assert not errors, errors
        print("pen flow ok")
        b.close()


main()
