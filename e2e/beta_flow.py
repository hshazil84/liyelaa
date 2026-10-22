"""Beta screens: the Beta tag, the feedback button, the wait message, and saving and opening a project file. Needs web on :3000.
   python3 e2e/beta_flow.py"""
import json, os, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
PUT = """(v) => new Promise((res) => { const r = indexedDB.open('keyval-store'); r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); const s = t.objectStore('keyval'); s.clear(); s.put(v, 'dfm.handwriting.v1'); t.oncomplete = () => res(true); }; })"""
GET = """(k) => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get(k); q.onsuccess = () => res(q.result || null); }; })"""
OUT = Path(tempfile.mkdtemp())


def seg(x, y): return {"p": {"x": x, "y": y}, "hi": {"x": 0, "y": 0}, "ho": {"x": 0, "y": 0}}


def glyph(i):
    cp = 0x780 + i
    box = [seg(40, 0), seg(300, 0), seg(300, 200), seg(40, 200)]
    return {"id": f"{cp:04X}", "cp": [cp], "kind": "letter", "contours": [box], "adv": 340, "source": "drawn"}


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 1000}, accept_downloads=True)
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "RSC payload" not in m.text else None)

        # beta tag, notice, feedback
        pg.goto(WEB)
        assert "beta" in pg.locator("header").inner_text().lower()
        assert "in beta" in pg.get_by_test_id("beta-note").inner_text()
        pg.get_by_test_id("feedback-open").click()
        href = pg.get_by_test_id("feedback-email").get_attribute("href")
        assert href.startswith("mailto:hshazil@gmail.com?subject="), href
        pg.keyboard.press("Escape")
        assert pg.get_by_test_id("feedback-panel").count() == 0

        # a slow build says it is still working, then finishes
        def slow(route):
            pg.wait_for_timeout(5600)
            route.fulfill(status=200, body=b"ttf", headers={"content-type": "font/ttf", "content-disposition": 'attachment; filename="T.ttf"', "access-control-allow-origin": "*", "access-control-expose-headers": "content-disposition"})
        pg.route("**/play/build", slow)
        pg.goto(f"{WEB}/play")
        pg.get_by_role("button", name="Save my font").click()
        assert pg.get_by_test_id("builder-waking").count() == 0
        with pg.expect_download():
            pg.get_by_role("button", name="Download .ttf").click()
            pg.get_by_test_id("builder-waking").wait_for(timeout=8000)
            assert "Still working" in pg.get_by_test_id("builder-waking").inner_text()
        pg.wait_for_function("!document.querySelector('[data-testid=builder-waking]')", timeout=5000)
        pg.unroute("**/play/build")

        # save a project file, then open it as a new font
        proj = {"v": 1, "glyphs": {glyph(i)["id"]: glyph(i) for i in range(5)}, "updatedAt": 1, "title": "Test font", "path": "draw",
                "spacing": {"all": 12, "side": {}, "pairs": {}}, "fontId": "abc123"}
        pg.goto(f"{WEB}/handwriting")
        pg.evaluate(PUT, proj)
        pg.goto(f"{WEB}/handwriting/export")
        pg.get_by_test_id("save-project").wait_for()
        with pg.expect_download() as dl:
            pg.get_by_test_id("save-project").click()
        f = OUT / dl.value.suggested_filename
        dl.value.save_as(str(f))
        assert f.name == "Test-font.thaanafont", f.name
        body = json.loads(f.read_text())
        assert body["app"] == "thaanafont" and body["kind"] == "project" and body["v"] == 1
        assert len(body["project"]["glyphs"]) == 5 and body["project"]["spacing"]["all"] == 12 and "fontId" not in body["project"]
        assert "Saved." in pg.get_by_test_id("project-msg").inner_text()

        pg.get_by_test_id("project-file").set_input_files(str(f))
        pg.wait_for_function("document.querySelector('[data-testid=project-msg]')?.textContent.includes('Opened as a new font')")
        assert "Test font (opened)" in pg.get_by_test_id("project-msg").inner_text()
        cur = pg.evaluate(GET, "dfm.handwriting.v1")
        assert cur["title"] == "Test font" and len(cur["glyphs"]) == 5, "the open font was not touched"
        idx = pg.evaluate(GET, "dfm.fonts.v1")
        assert len(idx["ids"]) == 2, idx
        parked = pg.evaluate(GET, f"dfm.font.{idx['ids'][1]}")
        assert parked["title"] == "Test font (opened)" and len(parked["glyphs"]) == 5 and parked["fontId"] == idx["ids"][1]

        # a file saved before the site was renamed (.myakuru, app "myakuru") still opens
        old = OUT / "Old-font.myakuru"; body["app"] = "myakuru"; old.write_text(json.dumps(body))
        pg.get_by_test_id("project-file").set_input_files(str(old))
        pg.wait_for_timeout(900)
        assert len(pg.evaluate(GET, "dfm.fonts.v1")["ids"]) == 3, "the old file was added as a font"

        # it shows in the font menu, and switching to it works
        pg.get_by_test_id("font-switcher").click()
        assert "Test font (opened)" in pg.get_by_test_id("font-menu").inner_text()
        pg.keyboard.press("Escape")

        # files that are not projects are refused plainly
        junk = OUT / "junk.thaanafont"; junk.write_text("not json")
        other = OUT / "other.thaanafont"; other.write_text(json.dumps({"hello": 1}))
        broken = OUT / "broken.thaanafont"; broken.write_text(json.dumps({"app": "thaanafont", "kind": "project", "v": 1, "project": {"v": 1, "glyphs": {"0780": {"id": 5}}}}))
        for fpath, text in ((junk, "not a ThaanaFont project"), (other, "not a ThaanaFont project"), (broken, "damaged")):
            pg.get_by_test_id("project-file").set_input_files(str(fpath))
            pg.wait_for_function(f"document.querySelector('[data-testid=project-msg]')?.textContent.includes('{text}')", timeout=5000)
        assert len(pg.evaluate(GET, "dfm.fonts.v1")["ids"]) == 3, "refused files add nothing"

        # the menu can open a file too
        pg.get_by_test_id("font-switcher").click()
        pg.get_by_test_id("project-file-menu").set_input_files(str(f))
        pg.wait_for_function("document.querySelector('[data-testid=project-note]')?.textContent.includes('Opened as')")
        assert len(pg.evaluate(GET, "dfm.fonts.v1")["ids"]) == 4
        assert not errors, errors
        b.close()
    print("beta flow ok")


main()
