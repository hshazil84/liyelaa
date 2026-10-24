"""The grey starter letter stays behind the drawing: before the first stroke, while the pen is down, and after.
Needs web on :3000.   python3 e2e/ghost_flow.py"""
import os, sys
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
SEED = """(p) => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); t.objectStore('keyval').put(p, 'dfm.handwriting.v1'); t.oncomplete = () => res(true); }; })"""


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 1000}).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"{WEB}/handwriting")
        pg.evaluate(SEED, {"v": 1, "glyphs": {}, "updatedAt": 1, "path": "draw"})
        pg.goto(f"{WEB}/handwriting/letters")
        pg.wait_for_selector("[data-testid=editor]")
        ghost = pg.get_by_test_id("ghost")
        ghost.first.wait_for()

        # before any stroke
        assert ghost.count() == 1, "the guide shows on a blank letter"

        # with the pen down, mid-stroke
        pg.get_by_test_id("editor").get_by_role("button", name="Brush", exact=True).click()
        box = pg.locator("[data-testid=editor] svg").first.bounding_box()
        x, y = box["x"] + box["width"] * 0.4, box["y"] + box["height"] * 0.45
        pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 60, y + 30, steps=6); pg.mouse.move(x + 90, y - 20, steps=6)
        assert ghost.count() == 1, "the guide stays while the pen is down"
        pg.mouse.up(); pg.wait_for_timeout(400)

        # after the stroke
        assert pg.get_by_test_id("glyph-fill").count() == 1, "the stroke became a letter"
        assert ghost.count() == 1, "the guide stays after the stroke"
        assert not errors, errors
        print("ghost flow ok")
        b.close()


if __name__ == "__main__":
    main()
