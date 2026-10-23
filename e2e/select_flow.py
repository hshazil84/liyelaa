"""Select tool: move a whole letter, resize it from a corner (keeps shape) and a side, undo, nudge with arrow keys, and the phone layout.
Needs web on :3000.   python3 e2e/select_flow.py"""
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


def box(pg):
    pts = [s["p"] for c in pg.evaluate(READ)["glyphs"]["0780"]["contours"] for s in c]
    xs, ys = [p["x"] for p in pts], [p["y"] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def centre(pg, sel):
    b = pg.get_by_test_id(sel).bounding_box()
    return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2


def tool(pg, name):
    return pg.get_by_test_id("editor").get_by_role("button", name=name, exact=True)


def drag(pg, a, b):
    pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, steps=4); pg.mouse.move(*b, steps=6); pg.mouse.up()
    pg.wait_for_timeout(300)


def seed(pg):
    pg.goto(f"{WEB}/handwriting")
    g = {"id": "0780", "cp": [0x780], "kind": "letter", "contours": oval(), "adv": 520, "source": "drawn", "checked": False}
    pg.evaluate(SEED, {"v": 1, "glyphs": {"0780": g}, "updatedAt": 1, "path": "draw"})
    pg.goto(f"{WEB}/handwriting/letters")
    pg.wait_for_selector("[data-testid=select-box]")


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 1000}).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "RSC payload" not in m.text else None)
        seed(pg)

        # 1. a drawn letter opens in Select: a box, handles, no dots
        assert tool(pg, "Select").get_attribute("aria-pressed") == "true"
        assert pg.locator("[data-node]").count() == 0
        assert pg.locator("[data-testid^=select-handle-]").count() == 8
        assert "Drag to move" in pg.get_by_test_id("editor-hint").inner_text()
        names = pg.get_by_test_id("editor").get_by_role("toolbar").locator("button").evaluate_all("els => els.map(e => e.innerText.trim())")
        assert names == ["Select", "Brush", "Pen", "Edit", "Erase"], names
        x0, y0, x1, y1 = box(pg)

        # 1b. the board fills the whole letter as one shape, so holes cut through like they do in the font
        assert pg.get_by_test_id("glyph-fill").count() == 1

        # 2. a tap on the box changes nothing
        cx, cy = centre(pg, "select-move")
        pg.mouse.click(cx, cy); pg.wait_for_timeout(300)
        assert box(pg) == (x0, y0, x1, y1), "a tap is not a move"
        assert not pg.get_by_label("Undo").is_enabled()

        # 3. drag inside the box: the whole letter moves, same size
        drag(pg, (cx, cy), (cx + 40, cy - 30))
        m0, m1, m2, m3 = box(pg)
        assert abs((m2 - m0) - (x1 - x0)) < 1 and abs((m3 - m1) - (y1 - y0)) < 1, "size unchanged by a move"
        assert m0 > x0 + 10 and m1 > y0 + 10, (m0, m1)         # right and up on screen = +x, +y in font space
        assert pg.get_by_label("Undo").is_enabled()

        # 4. undo and redo cover the move
        pg.get_by_label("Undo").click(); pg.wait_for_timeout(200)
        assert box(pg) == (x0, y0, x1, y1)
        pg.get_by_label("Redo").click(); pg.wait_for_timeout(200)
        assert abs(box(pg)[0] - m0) < 0.01
        pg.get_by_label("Undo").click(); pg.wait_for_timeout(200)

        # 5. corner handle: proportional resize about the opposite corner
        w, h = x1 - x0, y1 - y0
        hx, hy = centre(pg, "select-handle-se")
        drag(pg, (hx, hy), (hx + 60, hy + 10))               # mostly horizontal; proportional keeps the shape
        a0, a1, a2, a3 = box(pg)
        assert abs(a0 - x0) < 2 and abs(a3 - y1) < 2, "the opposite corner stays put"
        sx, sy = (a2 - a0) / w, (a3 - a1) / h
        assert sx > 1.05 and abs(sx - sy) < 0.02, (sx, sy)
        pg.get_by_label("Undo").click(); pg.wait_for_timeout(200)
        assert box(pg) == (x0, y0, x1, y1)

        # 6. Shift frees the corner
        hx, hy = centre(pg, "select-handle-se")
        pg.keyboard.down("Shift"); drag(pg, (hx, hy), (hx + 60, hy + 10)); pg.keyboard.up("Shift")
        a0, a1, a2, a3 = box(pg)
        sx, sy = (a2 - a0) / w, (a3 - a1) / h
        assert abs(sx - sy) > 0.05, (sx, sy)
        pg.get_by_label("Undo").click(); pg.wait_for_timeout(200)

        # 7. side handle stretches one way only
        hx, hy = centre(pg, "select-handle-e")
        drag(pg, (hx, hy), (hx + 50, hy))
        a0, a1, a2, a3 = box(pg)
        assert a2 - a0 > w + 10 and abs((a3 - a1) - h) < 1 and abs(a0 - x0) < 1, (a0, a1, a2, a3)
        pg.get_by_label("Undo").click(); pg.wait_for_timeout(200)

        # 8. dragging a handle far past the other side never flips or collapses the letter
        hx, hy = centre(pg, "select-handle-se")
        drag(pg, (hx, hy), (hx - 900, hy - 900))
        a0, a1, a2, a3 = box(pg)
        assert a2 > a0 and a3 > a1 and (a2 - a0) >= w * 0.09, (a0, a1, a2, a3)
        pg.get_by_label("Undo").click(); pg.wait_for_timeout(200)

        # 9. arrow keys nudge the whole letter, Shift nudges further
        pg.get_by_test_id("editor").focus()
        pg.keyboard.press("ArrowRight"); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(200)
        assert abs(box(pg)[0] - (x0 + 8)) < 0.5, box(pg)
        pg.keyboard.press("Shift+ArrowUp"); pg.wait_for_timeout(200)
        assert abs(box(pg)[1] - (y0 + 20)) < 0.5, box(pg)
        pg.get_by_label("Undo").click(); pg.get_by_label("Undo").click(); pg.get_by_label("Undo").click(); pg.wait_for_timeout(200)
        assert box(pg) == (x0, y0, x1, y1)

        # 9b. Ctrl+Z works after clicking blank page space, not only inside the editor
        drag(pg, (cx, cy), (cx + 40, cy - 30))
        assert box(pg)[0] > x0 + 10
        pg.mouse.click(5, 500); pg.keyboard.press("Control+z"); pg.wait_for_timeout(300)
        assert box(pg) == (x0, y0, x1, y1), "Ctrl+Z undoes from anywhere on the page"
        pg.keyboard.press("Control+Shift+z"); pg.wait_for_timeout(300)
        assert box(pg)[0] > x0 + 10, "Ctrl+Shift+Z redoes"
        pg.keyboard.press("Control+z"); pg.wait_for_timeout(300)

        # 9c. the zoom bar sits under the drawing, not over it, with Clear beside it and a hint for the wheel
        sv, zb = pg.get_by_test_id("editor-svg").bounding_box(), pg.get_by_label("Zoom in").bounding_box()
        assert zb["y"] >= sv["y"] + sv["height"] - 1, "zoom bar is below the drawing"
        cb = pg.get_by_test_id("clear-letter").bounding_box()
        assert abs((cb["y"] + cb["height"] / 2) - (zb["y"] + zb["height"] / 2)) < 20, "Clear is on the zoom bar row"
        assert "scroll to zoom" in pg.get_by_test_id("zoom-hint").inner_text()
        assert pg.get_by_role("tab").count() == 0 or pg.get_by_test_id("tab-letter").count() == 0, "no Tool, Letter, Check tabs"
        assert pg.get_by_test_id("shape-panel").is_visible(), "Reshape is always showing"

        # 10. Edit shows dots and no box; Select brings the box back
        tool(pg, "Edit").click()
        assert pg.locator("[data-node]").count() == 40 and pg.locator("[data-testid=select-box]").count() == 0
        tool(pg, "Select").click()
        assert pg.locator("[data-node]").count() == 0 and pg.locator("[data-testid=select-box]").count() == 1

        # 11. an empty letter opens in Brush
        pg.locator('[data-cell="0784"]').click()
        pg.wait_for_selector("[data-testid=editor-svg]")
        assert tool(pg, "Brush").get_attribute("aria-pressed") == "true"
        tool(pg, "Select").click()
        assert pg.locator("[data-testid=select-box]").count() == 0, "nothing to select on an empty letter"

        # 12. phone: five tools in one row, undo and redo beside the hint, nothing wider than the screen
        ph = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True).new_page()
        ph.on("pageerror", lambda e: errors.append(str(e)))
        seed(ph)
        ys = ph.get_by_test_id("editor").get_by_role("toolbar").locator("button").evaluate_all("els => els.map(e => Math.round(e.getBoundingClientRect().top))")
        assert len(set(ys)) == 1, ys
        ub, hb = ph.get_by_label("Undo").bounding_box(), ph.get_by_test_id("editor-hint").bounding_box()
        assert abs((ub["y"] + ub["height"] / 2) - (hb["y"] + hb["height"] / 2)) < 30, (ub, hb)
        assert ph.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "no sideways scroll"
        ph.screenshot(path="/tmp/select-phone.png")

        assert not errors, errors
        print("select flow ok")
        b.close()


main()
