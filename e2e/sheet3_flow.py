"""Joined letters on paper: print the sheet (2 pages for 38), write on it, photograph it, read it back. Needs web on :3000.
   python3 e2e/sheet3_flow.py [outdir]"""
import json, os, subprocess, sys, tempfile
from pathlib import Path
import cv2
from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
OUT.mkdir(parents=True, exist_ok=True)
sys.argv = [sys.argv[0], str(OUT)]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import synthetic_photo as sp  # noqa: E402

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
KEY = "dfm.handwriting.v1"
GET = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""
PUT = """(v) => new Promise((res) => { const r = indexedDB.open('keyval-store'); r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); t.objectStore('keyval').put(v, 'dfm.handwriting.v1'); t.oncomplete = () => res(true); }; })"""
WIPE = """() => new Promise((res) => { const r = indexedDB.open('keyval-store'); r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); t.objectStore('keyval').clear(); t.oncomplete = () => res(true); }; })"""

N = 38
LAYOUT = sp.LAYOUT
first = LAYOUT["sheets"][0]["cells"]
CW, CH = first[0]["w"], first[0]["h"]
GX, GY = min(c["x"] for c in first), min(c["y"] for c in first)


def lig(i):
    seq = [0x780 + i, 0x7B0]
    return {"id": f"lig{i + 1}", "sequence": seq, "when": "always",
            "glyph": {"id": f"lig{i + 1}", "cp": seq, "kind": "letter", "contours": [], "adv": 600, "source": "drawn"}}


def box(i):
    j = i % 36
    r, c = divmod(j, 6)
    return GX + (5 - c) * CW, GY + r * CH


def write_in(img, ppm, idxs):
    """A bar of dark ink, 14 mm by 8 mm, sitting on the baseline of each named box."""
    for i in idxs:
        x, y = box(i)
        x0, x1 = int((x + 8) * ppm), int((x + 22) * ppm)
        y0, y1 = int((y + 10.5) * ppm), int((y + 18.5) * ppm)
        cv2.rectangle(img, (x0, y0), (x1, y1), (40, 20, 20), -1)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 1000}).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "RSC payload" not in m.text else None)
        pg.goto(f"{WEB}/handwriting")
        pg.evaluate(WIPE)
        pg.evaluate(PUT, {"v": 1, "path": "draw", "updatedAt": 1, "glyphs": {}, "ligatures": [lig(i) for i in range(N)]})

        # the buttons appear once there is a joined letter
        pg.goto(f"{WEB}/handwriting/ligatures")
        pg.get_by_test_id("print-sheet").wait_for()
        assert pg.get_by_test_id("sheet-no").count() == 1                      # 38 spill onto a second page

        # the printable sheets
        pg.goto(f"{WEB}/handwriting/print-joined")
        pg.wait_for_selector("[data-sheet]")
        assert pg.locator("[data-sheet]").count() == 2
        assert pg.locator("[data-sheet='3'] [data-box]").count() == 36 and pg.locator("[data-sheet='4'] [data-box]").count() == 2
        assert "Sheet 4 of 4" in pg.locator("[data-sheet='4']").inner_text()
        pg.evaluate("document.querySelectorAll('nextjs-portal').forEach((e) => e.remove())")     # the dev server's error badge is not part of the page
        pg.emulate_media(media="print")
        pdf = OUT / "sheet3.pdf"
        pg.pdf(path=str(pdf), width="210mm", height="297mm", print_background=True, prefer_css_page_size=True)
        pg.emulate_media(media="screen")
        pages = int([l for l in subprocess.check_output(["pdfinfo", str(pdf)], text=True).splitlines() if l.startswith("Pages")][0].split()[1])
        assert pages == 2, pages
        DPI = 150
        subprocess.run(["pdftoppm", "-r", str(DPI), "-png", str(pdf), str(OUT / "s3")], check=True)
        ppm = DPI / 25.4
        pngs = sorted(OUT.glob("s3-*.png"))
        assert len(pngs) == 2, pngs

        # write on page 1 (joined letters 1, 2, 5) and page 2 (letter 37), photograph both a little askew
        jobs = [(pngs[0], 3, [0, 1, 4], OUT / "p3.jpg", 5), (pngs[1], 4, [36], OUT / "p4.jpg", -4)]
        for png, _, idxs, jpg, rot in jobs:
            img = cv2.imread(str(png))
            write_in(img, ppm, idxs)
            flat = OUT / f"flat_{jpg.stem}.png"
            cv2.imwrite(str(flat), img)
            sp.simulate(flat, jpg, rot, (3024, 4032), 1.0, 11)

        pg.goto(f"{WEB}/handwriting/ligatures")
        pg.wait_for_selector("[data-lig=lig1]")           # the joined letters have loaded, so the photo button is switched on
        pg.get_by_test_id("sheet-photo").set_input_files(str(OUT / "p3.jpg"))
        pg.get_by_test_id("sheet-msg").wait_for(timeout=60000)
        msg = pg.get_by_test_id("sheet-msg").inner_text()
        assert msg.startswith("3 joined shapes added"), msg
        pg.wait_for_timeout(500)
        ligs = {l["id"]: l for l in pg.evaluate(GET)["ligatures"]}
        for k in ("lig1", "lig2", "lig5"):
            g = ligs[k]["glyph"]
            assert g["contours"] and g["source"] == "photo" and g["cp"] == ligs[k]["sequence"], k
            assert abs(g["adv"] - (14 * 38 + 80)) < 80, (k, g["adv"])          # a 14 mm bar
        assert not ligs["lig3"]["glyph"]["contours"] and not ligs["lig37"]["glyph"]["contours"]

        # page 2 is chosen by name
        pg.get_by_test_id("sheet-no").select_option("4")
        pg.get_by_test_id("sheet-photo").set_input_files(str(OUT / "p4.jpg"))
        pg.wait_for_function("(document.querySelector('[data-testid=sheet-msg]')?.textContent || '').startsWith('1 joined shape added')", timeout=60000)
        pg.wait_for_timeout(500)
        ligs = {l["id"]: l for l in pg.evaluate(GET)["ligatures"]}
        assert ligs["lig37"]["glyph"]["contours"] and not ligs["lig38"]["glyph"]["contours"] and ligs["lig1"]["glyph"]["contours"]
        pg.reload()
        pg.wait_for_selector("[data-lig=lig37][data-status=drawn]")
        pg.screenshot(path=str(OUT / "sheet3_ligatures.png"))
        # the page stays short even with 38 joined letters, and the print button is on screen
        assert pg.locator("[aria-label='Pick letters']").bounding_box()["height"] < 800, "the picker is compact"
        assert pg.get_by_test_id("print-sheet").is_visible() and pg.get_by_test_id("print-sheet").bounding_box()["y"] < 400
        # the Photo page has the same card
        pg.goto(f"{WEB}/handwriting")
        pg.get_by_test_id("joined-card").get_by_test_id("print-sheet").wait_for()
        assert "38 joined letters" in pg.get_by_test_id("joined-card").inner_text()
        assert not errors, errors
        b.close()
    print("sheet 3 flow ok")


if __name__ == "__main__":
    main()
