"""Common joined letters: pick a mark, tick letters, add them all at once. Needs web on :3000.   python3 e2e/common_lig_flow.py"""
import os, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""
WIPE = """() => new Promise((res) => { const r = indexedDB.open('keyval-store'); r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); t.objectStore('keyval').clear(); t.oncomplete = () => res(true); }; })"""


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 1100}).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.goto(f"{WEB}/handwriting")
        pg.evaluate(WIPE)
        pg.goto(f"{WEB}/handwriting/ligatures")
        pg.get_by_test_id("common").wait_for()
        assert pg.get_by_test_id("picker").is_hidden()
        # abafili starts with nothing ticked; Tick all ticks every letter
        assert pg.get_by_test_id("add-many").is_disabled()
        pg.get_by_test_id("tick-all").click()
        assert pg.get_by_test_id("add-many").inner_text() == "Add 38 joined letters"
        pg.get_by_role("button", name="Clear").click()
        # sukun starts with 11 ticked as a guess
        pg.locator('[data-mark="07B0"]').click()
        assert pg.get_by_test_id("add-many").inner_text() == "Add 11 joined letters", pg.get_by_test_id("add-many").inner_text()
        pg.locator('[data-letter="0782"]').click()      # untick one
        assert pg.get_by_test_id("add-many").inner_text() == "Add 10 joined letters"
        pg.get_by_label("Only at the end of a word").check()
        pg.get_by_test_id("add-many").click()
        pg.wait_for_selector("[data-lig=lig10]")
        pg.wait_for_timeout(500)
        ligs = pg.evaluate(READ)["ligatures"]
        assert len(ligs) == 10 and all(l["sequence"][1] == 0x7B0 and l["when"] == "end" for l in ligs), ligs
        assert len({l["id"] for l in ligs}) == 10
        # those letters are now marked as already added; ticking nothing leaves the button off
        assert pg.locator('[data-letter="0783"]').is_disabled()
        assert pg.get_by_test_id("add-many").is_disabled()
        # a second family adds to the list
        pg.locator('[data-mark="07A6"]').click()
        pg.locator('[data-letter="0780"]').click()
        pg.locator('[data-letter="0781"]').click()
        pg.get_by_test_id("add-many").click()
        pg.wait_for_selector("[data-lig=lig12]")
        pg.wait_for_timeout(500)
        assert len(pg.evaluate(READ)["ligatures"]) == 12
        pg.reload()
        pg.wait_for_selector("[data-lig=lig12]")
        pg.screenshot(path=str(out / "common_lig.png"))
        assert not errors, errors
        b.close()
    print("common joined letters OK")


if __name__ == "__main__":
    main()
