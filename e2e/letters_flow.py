"""Clean-up step: import synthetic photos, then edit letters in the browser like a person would.
Needs the web app on :3000.   python3 e2e/letters_flow.py <dir with the synthetic photos>"""
import json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

PHOTOS = Path(sys.argv[1])
WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None


def project(pg):
    return pg.evaluate("""() => new Promise((res) => {
      const r = indexedDB.open('keyval-store');
      r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); };
    })""")


def settle(pg, ms=350):
    pg.wait_for_timeout(ms)          # edits are written to the browser's database a moment after the drag ends


def centre(pg, selector):
    b = pg.locator(selector).first.bounding_box()
    return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2


def to_screen(pg, fx, fy):
    """Font units -> page pixels, using the editor's own view box."""
    svg = pg.get_by_test_id("editor-svg")
    vb = [float(v) for v in svg.get_attribute("data-vb").split()]
    b = svg.bounding_box()
    return b["x"] + (fx - vb[0]) / vb[2] * b["width"], b["y"] + (-fy - vb[1]) / vb[3] * b["height"], vb[2] / b["width"]


def tool(pg, name):
    return pg.get_by_test_id("editor").get_by_role("button", name=name, exact=True)


def nodes(pg):
    return pg.locator("[data-node]").count()


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 900}).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # 1. get letters in through the photo page, as a person would
        for sheet, name in ((1, "sheet1_tilt.jpg"), (2, "sheet2_tilt.jpg")):
            pg.goto(f"{WEB}/handwriting")
            pg.get_by_text("Sheet 1 · Letters" if sheet == 1 else "Sheet 2 · Marks").click()
            pg.get_by_test_id("photo-input").set_input_files(str(PHOTOS / name))
            pg.wait_for_selector("[data-testid=summary]", timeout=60000)
            pg.get_by_test_id("use-letters").click()
            pg.wait_for_selector("[data-testid=saved-summary]")
        pg.get_by_test_id("continue-letters").click()
        pg.wait_for_url("**/handwriting/letters")
        pg.wait_for_selector("[data-node]")
        assert "0 of 38" in pg.get_by_test_id("progress").inner_text()
        assert pg.locator("[data-testid=grid] button").count() == 38
        assert pg.locator('[data-testid=grid] button[data-status=missing]').count() == 1      # the pale letter was not traced
        pg.screenshot(path=str(PHOTOS / "letters-1.png"))

        # 2. drag a point
        before = project(pg)["glyphs"]["0780"]
        n0 = nodes(pg)
        x, y = centre(pg, '[data-node="0-0"]')
        _, _, u = to_screen(pg, 0, 0)
        pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 20, y - 10, steps=4); pg.mouse.move(x + 50, y - 30, steps=6); pg.mouse.up()
        settle(pg)
        after = project(pg)["glyphs"]["0780"]
        dx = after["contours"][0][0]["p"]["x"] - before["contours"][0][0]["p"]["x"]
        dy = after["contours"][0][0]["p"]["y"] - before["contours"][0][0]["p"]["y"]
        assert abs(dx - 50 * u) < 3 * u and abs(dy - 30 * u) < 3 * u, (dx, dy, 50 * u, 30 * u)
        assert project(pg)["originals"]["0780"]["contours"] == before["contours"], "the traced version must be kept"
        assert after["contours"][0][1]["p"] == before["contours"][0][1]["p"], "only the dragged point moves"

        # 3. undo and redo
        tool(pg, "Undo").click(); settle(pg)
        assert project(pg)["glyphs"]["0780"]["contours"] == before["contours"]
        tool(pg, "Redo").click(); settle(pg)
        assert project(pg)["glyphs"]["0780"]["contours"] == after["contours"]
        assert not tool(pg, "Redo").is_enabled()

        # 4. double-click the outline: one point more, shape unchanged
        n1 = nodes(pg)
        pt = pg.evaluate("""() => { const el = document.querySelector('[data-contour="0"]'); const L = el.getTotalLength();
            const q = el.getPointAtLength(L * 0.41); const m = el.getScreenCTM(); return { x: m.a*q.x + m.c*q.y + m.e, y: m.b*q.x + m.d*q.y + m.f }; }""")
        pg.mouse.dblclick(pt["x"], pt["y"]); settle(pg)
        assert nodes(pg) == n1 + 1, (n1, nodes(pg))

        # 5. delete the selected point with the keyboard
        pg.keyboard.press("Delete"); settle(pg)
        assert nodes(pg) == n1, (n1, nodes(pg))

        # 6. eraser removes a point; so does clicking a speck
        tool(pg, "Erase").click()
        x, y = centre(pg, '[data-node="0-3"]')
        pg.mouse.click(x, y); settle(pg)
        assert nodes(pg) == n1 - 1, (n1, nodes(pg))
        tool(pg, "Edit").click()

        # 7. back to the traced drawing
        tool(pg, "Back to my drawing").click(); settle(pg)
        assert project(pg)["glyphs"]["0780"]["contours"] == before["contours"]
        assert nodes(pg) == n0

        # 8. draw a missing letter with the pen
        pg.locator('[data-cell="0786"]').click()
        pg.wait_for_selector("[data-testid=editor-svg]")
        assert tool(pg, "Brush").get_attribute("aria-pressed") == "true", "an empty letter starts with the marker"
        tool(pg, "Pen").click()
        pts = [(150, 0), (350, 0), (250, 300)]
        for fx, fy in pts:
            sx, sy, _ = to_screen(pg, fx, fy)
            pg.mouse.click(sx, sy)
        sx, sy, _ = to_screen(pg, *pts[0])
        pg.mouse.click(sx, sy)                                                   # click the first point to close
        settle(pg)
        g = project(pg)["glyphs"]["0786"]
        assert len(g["contours"]) == 1 and len(g["contours"][0]) == 3, g["contours"]
        assert g["adv"] >= 350 + 40, g["adv"]
        assert pg.locator('[data-cell="0786"]').get_attribute("data-status") == "traced"
        # a curved point: click and drag
        tool(pg, "Pen").click()
        a = to_screen(pg, 100, -150); c2 = to_screen(pg, 300, -150); d = to_screen(pg, 200, -250)
        pg.mouse.move(a[0], a[1]); pg.mouse.down(); pg.mouse.move(a[0] + 20, a[1] + 20, steps=4); pg.mouse.up()
        pg.mouse.click(c2[0], c2[1])
        pg.mouse.click(d[0], d[1])
        pg.keyboard.press("Enter"); settle(pg)
        g = project(pg)["glyphs"]["0786"]
        assert len(g["contours"]) == 2 and any(s["ho"]["x"] or s["ho"]["y"] for s in g["contours"][1]), "dragging while clicking should make a curve"
        pg.screenshot(path=str(PHOTOS / "letters-2.png"))

        # 9. marking letters as checked, and it survives a reload
        pg.locator('[data-cell="0780"]').click()
        pg.get_by_test_id("next").click(); settle(pg)
        pg.get_by_test_id("next").click(); settle(pg)
        assert "2 of 38" in pg.get_by_test_id("progress").inner_text()
        pg.reload(); pg.wait_for_selector("[data-testid=grid]"); settle(pg, 600)
        assert "2 of 38" in pg.get_by_test_id("progress").inner_text()
        assert len(project(pg)["glyphs"]["0786"]["contours"]) == 2

        # 10. vowel marks and extras tabs
        pg.get_by_role("tab", name="Vowel marks").click()
        assert pg.locator("[data-testid=grid] button").count() == 11
        pg.wait_for_selector("[data-node]")
        pg.get_by_role("tab", name="Extras").click()
        assert pg.locator("[data-testid=grid] button").count() == 27
        assert pg.get_by_test_id("size-check").count() in (0, 1)

        # 11. clearing the only drawing of a letter makes it "not drawn" again
        pg.get_by_role("tab", name="Letters").click()
        pg.locator('[data-cell="0786"]').click()
        tool(pg, "Clear this letter").click(); settle(pg)
        assert "0786" not in project(pg)["glyphs"]
        assert pg.locator('[data-cell="0786"]').get_attribute("data-status") == "missing"

        assert not errors, errors
        b.close()
    print("LETTERS FLOW OK")


main()
