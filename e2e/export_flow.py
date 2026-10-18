"""Spacing, then Test and export with the designer details, all the way to a downloaded zip.
Needs web on :3000 and builder on :8000.   python3 e2e/export_flow.py <dir with the synthetic photos>"""
import io, os, sys, zipfile
from pathlib import Path
from fontTools.ttLib import TTFont
from playwright.sync_api import sync_playwright

PHOTOS = Path(sys.argv[1])
WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1360, "height": 1000}, accept_downloads=True)
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        for sheet, name in ((1, "sheet1_tilt.jpg"), (2, "sheet2_tilt.jpg")):
            pg.goto(f"{WEB}/handwriting")
            pg.get_by_text("Sheet 1 · Letters" if sheet == 1 else "Sheet 2 · Marks").click()
            pg.get_by_test_id("photo-input").set_input_files(str(PHOTOS / name))
            pg.wait_for_selector("[data-testid=summary]", timeout=60000)
            pg.get_by_test_id("use-letters").click()
            pg.wait_for_selector("[data-testid=saved-summary]")

        # ---- spacing
        pg.goto(f"{WEB}/handwriting/spacing")
        pg.wait_for_selector("[data-testid=word]")
        pg.screenshot(path=str(PHOTOS / "spacing-1.png"))
        words = pg.get_by_test_id("word").first
        w0 = words.bounding_box()["width"]
        pg.locator("[data-letter]").first.click()
        sel = pg.get_by_test_id("sel-label").inner_text()
        pg.locator("#left").fill("60")
        pg.locator("#right").fill("30")
        pg.wait_for_timeout(500)
        assert words.bounding_box()["width"] > w0 + 5, "more space makes the word wider"
        sp = pg.evaluate(READ)["spacing"]
        assert any(v == {"left": 60, "right": 30} for v in sp["side"].values()), sp
        # a pair nudge
        rows = pg.locator("[data-pair]")
        if rows.count():
            key = rows.first.get_attribute("data-pair")
            rows.first.get_by_role("button", name="further").click()
            pg.wait_for_timeout(500)
            assert pg.evaluate(READ)["spacing"]["pairs"][key] == 10
        # even out resets the sides to a common rule
        pg.get_by_role("button", name="Even out all letters").click()
        pg.wait_for_timeout(500)
        assert pg.evaluate(READ)["spacing"]["side"], "even out sets space on letters"
        pg.screenshot(path=str(PHOTOS / "spacing-2.png"))
        pg.get_by_test_id("continue-export").click()
        pg.wait_for_url("**/handwriting/export")

        # ---- export
        pg.wait_for_selector("[data-testid=test-area][data-preview-state=ready]", timeout=60000)
        checks = pg.get_by_test_id("checks").inner_text()
        assert "letters drawn" in checks and "vowel marks" in checks
        assert pg.get_by_label("Keep it private").is_disabled(), "private needs every letter to be the person's own"
        assert pg.get_by_test_id("written-in").inner_text().count("the designer") == 1

        pg.get_by_label("Font name").fill("Hasan Hand")
        pg.get_by_label("Designer").fill("Hasan Shazil")
        pg.get_by_label("Website (optional)").fill("not a site")
        assert pg.get_by_role("alert").filter(has_text="spaces").is_visible()
        assert pg.get_by_test_id("download-zip").is_disabled()
        pg.get_by_label("Website (optional)").fill("fineprintmv.com")
        pg.get_by_label("Description (optional)").fill("Handwritten Thaana, made in Malé.")
        pg.get_by_label("Version").fill("1.2")
        assert pg.get_by_test_id("download-zip").is_enabled()
        assert "Hasan Shazil" in pg.get_by_test_id("written-in").inner_text() and "Version 1.2" in pg.get_by_test_id("written-in").inner_text()
        for t in ("Paragraph", "All letters"):
            pg.get_by_role("tab", name=t).click()
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(PHOTOS / "export-1.png"), full_page=True)

        # the details are remembered
        pg.reload()
        pg.wait_for_selector("[data-testid=test-area][data-preview-state=ready]", timeout=60000)
        assert pg.get_by_label("Designer").input_value() == "Hasan Shazil" and pg.get_by_label("Version").input_value() == "1.2"

        with pg.expect_download() as d:
            pg.get_by_test_id("download-zip").click()
        path = d.value.path()
        z = zipfile.ZipFile(path)
        names = set(z.namelist())
        assert {"Hasan-Hand.ttf", "Hasan-Hand.woff2", "OFL.txt", "README.txt"} <= names, names
        f = TTFont(io.BytesIO(z.read("Hasan-Hand.ttf")))
        n = f["name"]
        assert n.getDebugName(1) == "Hasan Hand" and n.getDebugName(9) == "Hasan Shazil"
        assert n.getDebugName(12) == "https://fineprintmv.com" and n.getDebugName(10).startswith("Handwritten Thaana, made in Malé.")
        assert n.getDebugName(5) == "Version 1.200"
        readme = z.read("README.txt").decode()
        assert "Designed by Hasan Shazil" in readme and "https://fineprintmv.com" in readme
        with pg.expect_download() as d2:
            pg.get_by_test_id("download-woff2").click()
        assert d2.value.suggested_filename == "Hasan-Hand.woff2"
        assert not errors, errors
        print("export ok:", sorted(names))
        b.close()


main()
