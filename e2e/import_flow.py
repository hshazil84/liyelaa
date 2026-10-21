"""Draw or import: drop SVG letters, check the grid, outline strokes, save, and reach clean-up.
Needs web on :3000 and the builder on :8000.   python3 e2e/import_flow.py [output dir]"""
import json, os, sys, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp())
OUT.mkdir(parents=True, exist_ok=True)
WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""

# Letters that exist in the reference table. The shape is a curved blob, scaled by `u` so two sets can be compared at different sizes.
CODES = ["0780", "0781", "0783", "0784", "0785", "0786", "0787", "0788", "0789", "078A", "078B", "078C"]


def blob(u, dy=0):
    """An upright oval, 40 wide and 70 tall, moved down by dy. Four points, so its true size can be read off the points."""
    cx, cy, rx, ry, k = 50, 50 + dy, 20, 35, 0.5523
    pts = [(cx - rx, cy), (cx, cy - ry), (cx + rx, cy), (cx, cy + ry)]
    f = lambda v: round(v * u, 2)
    return (f"M{f(pts[0][0])} {f(cy)} C{f(cx-rx)} {f(cy-k*ry)} {f(cx-k*rx)} {f(cy-ry)} {f(cx)} {f(cy-ry)} "
            f"C{f(cx+k*rx)} {f(cy-ry)} {f(cx+rx)} {f(cy-k*ry)} {f(cx+rx)} {f(cy)} "
            f"C{f(cx+rx)} {f(cy+k*ry)} {f(cx+k*rx)} {f(cy+ry)} {f(cx)} {f(cy+ry)} "
            f"C{f(cx-k*rx)} {f(cy+ry)} {f(cx-rx)} {f(cy+k*ry)} {f(cx-rx)} {f(cy)} Z")


def svg(path, u=4, extra="", fill='fill="#000"'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {100*u} {100*u}" width="{100*u}" height="{100*u}"><rect width="{100*u}" height="{100*u}" fill="#fff"/><path d="{path}" {fill}/>{extra}</svg>'


def main():
    files = {}
    for i, c in enumerate(CODES):
        files[f"U+{c}.svg"] = svg(blob(4, i - 6))
    # a letter drawn only with a stroke, a file that is text, a file that is not a letter code, and a file with no shapes
    files["U+0782.svg"] = svg("M80 200 L320 200", fill='fill="none" stroke="#000" stroke-width="30"')
    files["U+0786.svg"] = svg("M0 0Z", extra='<text x="10" y="50">ހ</text>')
    files["notes.svg"] = svg(blob(4))
    d = OUT / "svgs"; d.mkdir(exist_ok=True)
    for n, t in files.items():
        (d / n.replace("+", "")).write_text(t)   # "U+0780.svg" is saved as "U0780.svg": the importer must read that too

    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1500, "height": 1100}).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        pg.goto(f"{WEB}/")
        pg.get_by_role("link", name="Open the editor").click()
        pg.wait_for_url("**/draw")
        pg.get_by_test_id("svg-input").set_input_files([str(d / n.replace("+", "")) for n in files])
        pg.wait_for_selector("[data-testid=import-summary]", timeout=30000)
        ok = pg.locator("[data-cell][data-status=ok]").count()
        fix = pg.locator("[data-cell][data-status=fix]").count()
        print("matched", ok, "need a fix", fix)
        assert ok == len(CODES) - 1, ok          # 0786 is text only; 0782 has strokes only
        assert fix == 2, fix
        assert "notes.svg" in pg.get_by_test_id("unmatched").inner_text()
        pg.get_by_test_id("stroke-notice").wait_for()
        pg.screenshot(path=str(OUT / "import-1.png"), full_page=True)

        pg.get_by_test_id("outline-strokes").click()
        pg.wait_for_selector("[data-cell='0782'][data-status=ok]", timeout=30000)
        assert pg.locator("[data-testid=stroke-notice]").count() == 0
        pg.screenshot(path=str(OUT / "import-2.png"), full_page=True)

        pg.get_by_test_id("use-letters").click()
        pg.wait_for_selector("[data-testid=import-saved]")
        proj = pg.evaluate(READ)
        assert proj["path"] == "draw", proj.get("path")
        gs = proj["glyphs"]
        assert all(g["source"] == "drawn" for g in gs.values())
        assert "0782" in gs and "0786" not in gs and len(gs) == len(CODES), sorted(gs)
        # the letter sits on the page like a font letter: left bearing 40, advance = width + 80
        for g in gs.values():
            xs = [pt["p"]["x"] for c in g["contours"] for pt in c]
            assert abs(min(xs) - 40) < 1.5, (g["id"], min(xs))
            assert abs(g["adv"] - (max(xs) + 40)) < 3, (g["id"], g["adv"], max(xs))
        # the artwork was 400 units wide; it was resized to the template size, so the letters are letter-sized, not 400 wide
        heights = sorted(max(pt["p"]["y"] for c in g["contours"] for pt in c) - min(pt["p"]["y"] for c in g["contours"] for pt in c)
                         for g in gs.values() if g["id"] != "0782")
        median_h = heights[len(heights) // 2]
        print("median letter height", round(median_h))
        assert 250 < median_h < 420, median_h          # AK Rasmee's letters are about 300 to 380 units tall

        pg.get_by_test_id("continue-letters").click()
        pg.wait_for_url("**/handwriting/letters")
        pg.wait_for_selector("[data-cell='0784'][data-status=traced], [data-cell='0784']")
        names = pg.locator("ol[aria-label=Steps] li").all_inner_texts()
        print("steps", [n.replace("\n", " ") for n in names])
        assert any("Draw or import" in n for n in names)
        pg.screenshot(path=str(OUT / "import-3.png"), full_page=True)

        # pasting SVG code adds a letter the files did not have
        pg.goto(f"{WEB}/draw")
        pg.get_by_role("tab", name="Paste", exact=True).click()
        pg.get_by_test_id("paste-for").select_option("0789")
        pg.get_by_test_id("paste-text").fill(files["U+0789.svg"])
        pg.get_by_test_id("paste-add").click()
        pg.wait_for_selector("[data-cell='0789'][data-status=ok]", timeout=30000)

        # the same artwork at another size lands at the same size: 25 units per side instead of 400
        small = {n: svg(blob(1, i - 6)) for i, n in enumerate(f"U+{c}.svg" for c in CODES)}
        pg.goto(f"{WEB}/draw")
        d2 = OUT / "svgs-small"; d2.mkdir(exist_ok=True)
        for n, t in small.items():
            (d2 / n).write_text(t)
        pg.get_by_test_id("svg-input").set_input_files([str(d2 / n) for n in small])
        pg.wait_for_selector("[data-cell='0784'][data-status=ok]", timeout=30000)
        assert pg.locator("[data-cell][data-status=ok]").count() == len(CODES)
        pg.get_by_test_id("use-letters").click()
        pg.wait_for_selector("[data-testid=import-saved]")
        gs2 = pg.evaluate(READ)["glyphs"]
        for c in ("0780", "0784", "078C"):
            w1 = max(pt["p"]["x"] for ct in gs[c]["contours"] for pt in ct)
            w2 = max(pt["p"]["x"] for ct in gs2[c]["contours"] for pt in ct)
            assert abs(w1 - w2) / w1 < 0.05, (c, w1, w2)      # the letter set differs a little, so the shared scale differs a little

        real = [e for e in errors if "Failed to load resource" not in e]
        print("console errors:", real)
        assert not real, real
        b.close()
    print("import flow ok:", OUT)


main()
