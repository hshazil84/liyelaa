"""English alphabet: the Alphabet tab, its guides and Inter hint, drawing a letter, and the printable sheets read back from a photo.
Needs web on :3000.   python3 e2e/alphabet_flow.py"""
import json, os, subprocess, tempfile
from pathlib import Path
import cv2, numpy as np
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
LAYOUT = json.loads((Path(__file__).resolve().parent.parent / "web/lib/template-layout.json").read_text())
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""
PUT = """(v) => new Promise((res) => { const r = indexedDB.open('keyval-store'); r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); const s = t.objectStore('keyval'); s.clear(); s.put(v, 'dfm.handwriting.v1'); t.oncomplete = () => res(true); }; })"""


def to_screen(pg, fx, fy):
    svg = pg.get_by_test_id("editor-svg")
    vb = [float(v) for v in svg.get_attribute("data-vb").split()]
    b = svg.bounding_box()
    return b["x"] + (fx - vb[0]) / vb[2] * b["width"], b["y"] + (-fy - vb[1]) / vb[3] * b["height"]


def drag(pg, pts):
    xy = [to_screen(pg, x, y) for x, y in pts]
    pg.mouse.move(*xy[0]); pg.mouse.down()
    for p in xy[1:]:
        pg.mouse.move(*p, steps=4)
    pg.mouse.up(); pg.wait_for_timeout(500)


def tool(pg, name):
    return pg.get_by_test_id("editor").get_by_role("button", name=name, exact=True)


def sheet_photo(pdf, page_no, letters, out):
    """Rasterise one printed page and write over some of its boxes, like a person would."""
    base = out + f"-{page_no}"
    subprocess.run(["pdftoppm", "-r", "150", "-f", str(page_no), "-l", str(page_no), "-png", pdf, base], check=True)
    png = next(Path(out).parent.glob(Path(base).name + "*.png"))
    img = cv2.imread(str(png))
    k = 150 / 25.4
    cells = {c["id"]: c for c in LAYOUT["sheets"][0]["cells"]}      # same geometry as the alphabet pages
    first = next(iter(cells.values()))
    gx = min(c["x"] for c in cells.values()); gy = min(c["y"] for c in cells.values())
    for i in letters:
        r, c = divmod(i, 6)
        x, y = gx + c * first["w"], gy + r * first["h"]
        base_y = y + LAYOUT["guides"]["baseY"]
        pts = np.array([[x + 8, base_y], [x + 15, base_y - 12], [x + 22, base_y]]) * k
        cv2.polylines(img, [pts.astype(np.int32)], False, (40, 40, 40), int(1.6 * k), cv2.LINE_AA)
    cv2.imwrite(str(png), img)
    return png


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 1000}, accept_downloads=True).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "RSC payload" not in m.text else None)

        # 1. the Alphabet tab: 52 tiles, A to Z then a to z, left to right
        pg.goto(f"{WEB}/handwriting")
        pg.evaluate(PUT, {"v": 1, "glyphs": {}, "updatedAt": 1, "path": "draw"})
        pg.goto(f"{WEB}/handwriting/letters")
        pg.get_by_role("tab", name="Alphabet").click()
        assert pg.locator("[data-testid=grid] button").count() == 52
        assert "0 of 52" in pg.get_by_test_id("progress").inner_text()
        assert pg.get_by_test_id("grid").get_attribute("dir") == "ltr"
        tiles = pg.locator("[data-testid=grid] button").evaluate_all("els => els.map(e => e.dataset.cell)")
        assert tiles[0] == "0041" and tiles[25] == "005A" and tiles[26] == "0061" and tiles[51] == "007A", tiles
        assert pg.locator('[data-testid=grid] button >> nth=0').inner_text().strip() == "A"
        pg.get_by_role("tab", name="Letters").click()
        assert pg.get_by_test_id("grid").get_attribute("dir") == "rtl" and "of 38" in pg.get_by_test_id("progress").inner_text()
        pg.get_by_role("tab", name="Alphabet").click()

        # 2. a capital: cap line and baseline, no x-height line; the Inter hint shows
        pg.locator('[data-cell="0041"]').click()
        pg.wait_for_selector("[data-testid=editor-svg]")
        svg = pg.get_by_test_id("editor-svg")
        assert svg.locator("text", has_text="Cap line").count() == 1 and svg.locator("text", has_text="x-height").count() == 0
        assert svg.locator('path[opacity="0.1"]').count() == 1, "the grey Inter hint"
        assert tool(pg, "Brush").get_attribute("aria-pressed") == "true"

        # 3. a small letter has its own height line
        pg.locator('[data-cell="0061"]').click()
        pg.wait_for_selector("[data-testid=editor-svg]")
        assert pg.get_by_test_id("editor-svg").locator("text", has_text="x-height").count() == 1

        # 4. draw it: saved as an English letter, kept apart from the Thaana ones
        drag(pg, [(100, 40), (180, 330), (260, 40)])
        pg.wait_for_timeout(500)
        proj = pg.evaluate(READ)
        g = proj["glyphs"]["0061"]
        assert g["kind"] == "latin" and g["cp"] == [97] and g["contours"], g
        assert g["adv"] > 100
        pg.locator('[data-cell="0041"]').click()
        assert "1 of 52" in pg.get_by_test_id("progress").inner_text()
        pg.get_by_role("tab", name="Letters").click()
        assert "0 of 38" in pg.get_by_test_id("progress").inner_text(), "English letters do not count as Thaana"

        # 5. the Level, Tails and Spacing steps do not see it
        pg.goto(f"{WEB}/handwriting/level")
        pg.wait_for_timeout(1500)
        assert pg.locator("[data-cell='0061']").count() == 0
        pg.goto(f"{WEB}/handwriting/tails")
        pg.wait_for_timeout(800)
        assert pg.evaluate(READ)["glyphs"]["0061"]["kind"] == "latin"

        # 6. the printable sheets: a two page PDF
        pg.goto(f"{WEB}/handwriting")
        pg.evaluate(PUT, {"v": 1, "glyphs": {}, "updatedAt": 1, "path": "photo"})
        pg.goto(f"{WEB}/handwriting")
        assert pg.get_by_test_id("alphabet-card").is_visible()
        with pg.expect_download() as dl:
            pg.get_by_test_id("alphabet-pdf").click()
        tmp = tempfile.mkdtemp()
        pdf = str(Path(tmp) / dl.value.suggested_filename)
        dl.value.save_as(pdf)
        assert dl.value.suggested_filename == "thaanafont-alphabet.pdf"
        from pypdf import PdfReader
        rd = PdfReader(pdf)
        assert len(rd.pages) == 2
        t1, t2 = rd.pages[0].extract_text(), rd.pages[1].extract_text()
        assert "Alphabet" in t1 and "Sheet 1 of 2" in t1 and "U+0041" in t1 and "U+005A" in t1 and "U+0061" not in t1
        assert "Sheet 2 of 2" in t2 and "U+0061" in t2 and "U+007A" in t2

        # 7. a photo of sheet 1 with A, B and the first of the second row written in: read back as English letters
        png = sheet_photo(pdf, 1, [0, 1, 6], str(Path(tmp) / "p"))
        pg.get_by_test_id("alphabet-photo").set_input_files(str(png))
        pg.wait_for_selector("[data-testid=alphabet-msg]", timeout=60000)
        assert "3 letters added" in pg.get_by_test_id("alphabet-msg").inner_text(), pg.get_by_test_id("alphabet-msg").inner_text()
        saved = pg.evaluate(READ)
        assert sorted(saved["glyphs"]) == ["0041", "0042", "0047"], sorted(saved["glyphs"])
        assert all(v["kind"] == "latin" and v["contours"] for v in saved["glyphs"].values())
        assert saved.get("path") == "photo"

        # 8. sheet 2 reads too, and the Alphabet tab shows what came in
        png2 = sheet_photo(pdf, 2, [0], str(Path(tmp) / "q"))
        pg.get_by_test_id("alphabet-sheet-no").select_option("92")
        pg.get_by_test_id("alphabet-photo").set_input_files(str(png2))
        pg.wait_for_function("(document.querySelector('[data-testid=alphabet-msg]')?.innerText ?? '').includes('1 letter added')", timeout=60000)
        assert "0061" in pg.evaluate(READ)["glyphs"]
        pg.goto(f"{WEB}/handwriting/letters")
        pg.get_by_role("tab", name="Alphabet").click()
        assert pg.locator('[data-cell="0041"]').get_attribute("data-status") == "traced"
        assert pg.locator('[data-cell="0043"]').get_attribute("data-status") == "missing"

        assert not errors, errors
        print("alphabet flow ok")
        b.close()


main()
