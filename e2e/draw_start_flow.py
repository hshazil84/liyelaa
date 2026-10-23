"""Home "Open the editor": a blank drawn font, the handwriting font put aside, nothing mixed.   python3 e2e/draw_start_flow.py"""
import os, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
GET = """(k) => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get(k); q.onsuccess = () => res(q.result || null); }; })"""
PUT = """([k, v]) => new Promise((res) => { const r = indexedDB.open('keyval-store'); r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); t.objectStore('keyval').put(v, k); t.oncomplete = () => res(true); }; })"""
WIPE = """() => new Promise((res) => { const r = indexedDB.open('keyval-store'); r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); t.objectStore('keyval').clear(); t.oncomplete = () => res(true); }; })"""


def seg(x, y): return {"p": {"x": x, "y": y}, "hi": {"x": 0, "y": 0}, "ho": {"x": 0, "y": 0}}
def glyph(i, source):
    return {"id": f"{0x780 + i:04X}", "cp": [0x780 + i], "kind": "letter", "source": source, "adv": 400,
            "contours": [[seg(40, 0), seg(300, 0), seg(300, 300), seg(40, 300)]]}


def check(ok, msg):
    print(("ok   " if ok else "FAIL ") + msg)
    if not ok: check.bad += 1
check.bad = 0


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 1000}).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"{WEB}/handwriting"); pg.evaluate(WIPE)

        # a photo font with letters is open: the card must not touch it
        pg.evaluate(PUT, ["dfm.handwriting.v1", {"v": 1, "path": "photo", "title": "My handwriting", "updatedAt": 1, "glyphs": {glyph(i, "photo")["id"]: glyph(i, "photo") for i in range(5)}}])
        pg.goto(f"{WEB}/")
        pg.get_by_role("link", name="Open the editor").click()
        pg.wait_for_url("**/handwriting/letters")
        pg.wait_for_selector("[data-testid=draw-hint]")
        cur = pg.evaluate(GET, "dfm.handwriting.v1")
        check(cur["glyphs"] == {} and cur["path"] == "draw" and cur["title"] == "Drawn letters", "blank drawn font is open")
        idx = pg.evaluate(GET, "dfm.fonts.v1")
        parked = [pg.evaluate(GET, f"dfm.font.{i}") for i in idx["ids"] if i != cur["fontId"]]
        check(len(parked) == 1 and len(parked[0]["glyphs"]) == 5 and parked[0]["title"] == "My handwriting", "handwriting font put aside, 5 letters intact")
        check(pg.get_by_test_id("progress").inner_text().startswith("0 of"), "grid is blank")
        check(pg.get_by_test_id("bring-svg").is_visible(), "Bring in SVG files link shown")
        check("Draw" in pg.locator("header").inner_text() and "Draw or import" not in pg.locator("header").inner_text(), "step reads Draw")
        pg.screenshot(path=str(out / "draw-start.png"))

        # draw with the marker straight away: the tool is ready
        box = pg.locator("svg").filter(has=pg.locator("text")).last.bounding_box()
        pg.mouse.move(box["x"] + box["width"] * 0.4, box["y"] + box["height"] * 0.4)
        pg.mouse.down(); pg.mouse.move(box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.6, steps=8); pg.mouse.up()
        pg.wait_for_timeout(600)
        cur = pg.evaluate(GET, "dfm.handwriting.v1")
        check(len(cur["glyphs"]) == 1, "a stroke with the marker makes a letter")

        # again: it carries on with the drawn font, no third font
        pg.goto(f"{WEB}/"); pg.get_by_role("link", name="Open the editor").click()
        pg.wait_for_url("**/handwriting/letters"); pg.wait_for_selector("[data-testid=progress]")
        check(len(pg.evaluate(GET, "dfm.fonts.v1")["ids"]) == 2, "second visit carries on, no extra font")
        check(len(pg.evaluate(GET, "dfm.handwriting.v1")["glyphs"]) == 1, "drawn letter still there")

        # a brand new browser: the empty font is used as it is
        pg.evaluate(WIPE); pg.goto(f"{WEB}/draw/start"); pg.wait_for_url("**/handwriting/letters"); pg.wait_for_selector("[data-testid=draw-hint]")
        check(pg.evaluate(GET, "dfm.handwriting.v1")["path"] == "draw", "empty project becomes a drawing one")

        # the SVG page still works from the link
        pg.get_by_test_id("bring-svg").click(); pg.wait_for_url("**/draw")
        check(pg.get_by_test_id("open-blank").is_visible(), "SVG import page reachable")
        check(not errors, f"no page errors {errors[:2]}")
        b.close()
    print("DONE", "FAIL" if check.bad else "PASS"); sys.exit(1 if check.bad else 0)


main()
