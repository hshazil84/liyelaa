"""Several fonts: the header switcher, New font, the mix-up prompt, My fonts (rename, backup, open a backup, delete). Needs web on :3000.   python3 e2e/fonts_flow.py"""
import json, os, sys, tempfile
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
PASTE = """(text) => { const dt = new DataTransfer(); dt.setData('text/plain', text);
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }"""
SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 90 C 30 60 60 40 90 10 L 95 20 C 65 50 40 75 20 95Z"/></svg>'


def seg(x, y): return {"p": {"x": x, "y": y}, "hi": {"x": 0, "y": 0}, "ho": {"x": 0, "y": 0}}
def glyph(i, source):
    return {"id": f"{0x780 + i:04X}", "cp": [0x780 + i], "kind": "letter", "source": source, "adv": 400,
            "contours": [[seg(40, 0), seg(300, 0), seg(300, 300), seg(40, 300)]]}


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 1000}, accept_downloads=True)
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.goto(f"{WEB}/handwriting")
        pg.evaluate(WIPE)
        # a font the old way: one project, no id, letters from a photo
        pg.evaluate(PUT, ["dfm.handwriting.v1", {"v": 1, "path": "photo", "updatedAt": 1, "glyphs": {glyph(i, "photo")["id"]: glyph(i, "photo") for i in range(5)}}])

        # the open font appears in the header, even though it was made before fonts existed
        pg.goto(f"{WEB}/draw")
        pg.wait_for_selector("[data-testid=font-switcher]")
        assert "My font" in pg.get_by_test_id("font-switcher").inner_text()
        assert "5 of 38" in pg.get_by_test_id("font-switcher").inner_text()

        # pasting drawn letters into it asks first
        pg.evaluate(PASTE, SVG)
        pg.wait_for_selector("[data-testid=use-letters]:not([disabled])")
        pg.get_by_test_id("use-letters").click()
        pg.wait_for_selector("[data-testid=mix-prompt]")
        assert "5 letters traced from a photo" in pg.get_by_test_id("mix-prompt").inner_text()
        pg.screenshot(path=str(out / "fonts-mix.png"))
        pg.get_by_test_id("mix-new").click()
        pg.wait_for_selector("[data-testid=import-saved]")
        pg.wait_for_function("() => document.querySelector('[data-testid=font-switcher]').innerText.includes('Drawn letters')")
        cur = pg.evaluate(GET, "dfm.handwriting.v1")
        assert list(cur["glyphs"]) == ["0780"] and cur["title"] == "Drawn letters" and cur["path"] == "draw", cur
        idx = pg.evaluate(GET, "dfm.fonts.v1")
        assert len(idx["ids"]) == 2, idx
        parked = [pg.evaluate(GET, f"dfm.font.{i}") for i in idx["ids"] if i != cur["fontId"]][0]
        assert len(parked["glyphs"]) == 5 and parked["path"] == "photo", parked

        # the switcher lists both, and switching brings the photo font back
        pg.get_by_test_id("font-switcher").click()
        menu = pg.get_by_test_id("font-menu").inner_text()
        assert "Drawn letters" in menu and "My font" in menu, menu
        pg.get_by_test_id("font-menu").get_by_text("My font", exact=True).click()
        pg.wait_for_url("**/handwriting/letters")
        pg.wait_for_selector("[data-testid=font-switcher]")
        assert "My font" in pg.get_by_test_id("font-switcher").inner_text()
        now = pg.evaluate(GET, "dfm.handwriting.v1")
        assert len(now["glyphs"]) == 5, now

        # New font: a name and a way in
        pg.get_by_test_id("font-switcher").click()
        pg.get_by_test_id("new-font-open").click()
        pg.get_by_test_id("new-font-name").fill("Brush letters")
        pg.get_by_test_id("make-font").click()
        pg.wait_for_url("**/draw")
        pg.wait_for_selector("[data-testid=font-switcher]")
        assert "Brush letters" in pg.get_by_test_id("font-switcher").inner_text()
        assert pg.evaluate(GET, "dfm.handwriting.v1")["glyphs"] == {}
        assert len(pg.evaluate(GET, "dfm.fonts.v1")["ids"]) == 3

        # My fonts: rename, backup, open a backup, delete
        pg.goto(f"{WEB}/handwriting/fonts")
        pg.wait_for_selector("[data-testid=font-cards] li")
        assert pg.locator("[data-testid=font-cards] li").count() == 3
        assert pg.locator("[data-testid=font-cards] li[data-active=true]").count() == 1
        card = pg.locator("[data-testid=font-cards] li", has_text="Drawn letters")
        card.get_by_role("button", name="Rename").click()
        pg.get_by_test_id("rename-input").fill("Illustrator set")
        pg.get_by_test_id("rename-input").press("Enter")
        pg.wait_for_selector("text=Illustrator set")
        card = pg.locator("[data-testid=font-cards] li", has_text="Illustrator set")
        with pg.expect_download() as dl:
            card.get_by_role("button", name="Save a backup").click()
        path = out / dl.value.suggested_filename
        dl.value.save_as(str(path))
        assert path.suffix == ".thaanafont"
        data = json.loads(path.read_text())
        assert data["kind"] == "font" and data["title"] == "Illustrator set" and list(data["project"]["glyphs"]) == ["0780"], data["title"]
        pg.get_by_test_id("backup-input").set_input_files(str(path))
        pg.wait_for_url("**/handwriting/letters")           # the backup opens as a new font with letters in it
        pg.goto(f"{WEB}/handwriting/fonts")
        pg.wait_for_selector("[data-testid=font-cards] li")
        assert pg.locator("[data-testid=font-cards] li").count() == 4, pg.locator("[data-testid=font-cards] li").count()
        pg.get_by_test_id("backup-input").set_input_files({"name": "x.thaanafont", "mimeType": "application/json", "buffer": b"nope"})
        pg.wait_for_selector("[data-testid=fonts-message]")
        assert "not a ThaanaFont backup" in pg.get_by_test_id("fonts-message").inner_text()
        pg.screenshot(path=str(out / "fonts-page.png"))
        card = pg.locator("[data-testid=font-cards] li", has_text="Brush letters")
        card.get_by_role("button", name="Delete").click()
        assert "cannot be undone" in pg.get_by_test_id("delete-dialog").inner_text()
        pg.get_by_test_id("confirm-delete").click()
        pg.wait_for_function("() => document.querySelectorAll('[data-testid=font-cards] li').length === 3")
        assert "Brush letters" not in pg.get_by_test_id("font-cards").inner_text()
        # deleting the open font opens another one
        pg.locator("[data-testid=font-cards] li[data-active=true]").get_by_role("button", name="Delete").click()
        pg.get_by_test_id("confirm-delete").click()
        pg.wait_for_function("() => document.querySelectorAll('[data-testid=font-cards] li').length === 2")
        assert pg.locator("[data-testid=font-cards] li[data-active=true]").count() == 1
        assert not errors, errors
        print("fonts flow ok")
        b.close()


main()
