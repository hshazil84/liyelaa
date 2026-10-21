"""Clicking and dragging a point: a click never moves it, grabbing off-centre never makes it jump, and a missed mouse-up does not leave it stuck to the pointer.
Needs web on :3000.   python3 e2e/node_flow.py"""
import math, os, sys
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""
SEED = """(p) => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); t.objectStore('keyval').put(p, 'dfm.handwriting.v1'); t.oncomplete = () => res(true); }; })"""


def oval(n=40):
    return [[{"p": {"x": 300 + 100 * math.cos(i / n * 6.2832), "y": 200 + 180 * math.sin(i / n * 6.2832)}, "hi": {"x": 0, "y": 0}, "ho": {"x": 0, "y": 0}} for i in range(n)]]


def point(pg, i=0):
    return pg.evaluate(READ)["glyphs"]["0780"]["contours"][0][i]["p"]


def centre(pg, sel):
    b = pg.locator(sel).first.bounding_box()
    return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 1000}).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"{WEB}/handwriting")
        g = {"id": "0780", "cp": [0x780], "kind": "letter", "contours": oval(), "adv": 520, "source": "drawn", "checked": False}
        pg.evaluate(SEED, {"v": 1, "glyphs": {"0780": g}, "updatedAt": 1, "path": "draw"})
        pg.goto(f"{WEB}/handwriting/letters")
        pg.wait_for_selector("[data-node='0-10']")
        start = pg.evaluate(READ)["glyphs"]["0780"]["contours"]
        svg = pg.get_by_test_id("editor-svg").bounding_box()
        scale = 1400 / svg["width"]                        # font units per pixel

        # 1. a plain click, and a click with a little wobble, leave the point where it was
        x, y = centre(pg, "[data-node='0-10']")
        pg.mouse.click(x, y)
        pg.mouse.move(x + 4, y + 3); pg.mouse.down(); pg.mouse.move(x + 6, y + 4); pg.mouse.up()
        pg.wait_for_timeout(300)
        assert pg.evaluate(READ)["glyphs"]["0780"]["contours"] == start, "clicking must not move a point"

        # 2. grab 6px off-centre and drag 30px right: the point moves by 30px, it does not jump to the pointer
        before = point(pg, 10)
        pg.mouse.move(x + 5, y + 5); pg.mouse.down()
        pg.mouse.move(x + 20, y + 5, steps=4); pg.mouse.move(x + 35, y + 5, steps=4); pg.mouse.up()
        pg.wait_for_timeout(300)
        after = point(pg, 10)
        assert abs((after["x"] - before["x"]) - 30 * scale) < 2.5, (before, after, scale)
        assert abs(after["y"] - before["y"]) < 1.5, (before, after)

        # 3. a pointer that moves with no button down does nothing, even if the mouse-up was missed
        x, y = centre(pg, "[data-node='0-20']")
        snap = pg.evaluate(READ)["glyphs"]["0780"]["contours"]
        pg.mouse.move(x, y); pg.mouse.down()
        pg.evaluate("""() => { const s = document.querySelector('[data-testid=editor-svg]');
          s.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 20, clientY: 20, buttons: 0, pointerId: 1 })); }""")
        pg.mouse.up()
        pg.wait_for_timeout(300)
        assert pg.evaluate(READ)["glyphs"]["0780"]["contours"] == snap, "a stray move after a missed mouse-up must not drag the point"
        assert not errors, errors
        print("node flow ok")
        b.close()


main()
