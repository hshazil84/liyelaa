"""The preview on the spacing and vowel pages must match the exported font. Needs web on :3000 and builder on :8000.
   python3 e2e/parity_flow.py <dir with the synthetic photos>"""
import io, json, os, subprocess, sys, tempfile, urllib.request
from pathlib import Path
import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont
from playwright.sync_api import sync_playwright

PHOTOS = Path(sys.argv[1])
ROOT = Path(__file__).resolve().parent.parent
WEB = os.environ.get("WEB_URL", "http://localhost:3000")
BUILDER = os.environ.get("BUILDER_URL", "http://localhost:8000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""


def project():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_page()
        for sheet, name in ((1, "sheet1_tilt.jpg"), (2, "sheet2_tilt.jpg")):
            pg.goto(f"{WEB}/handwriting")
            pg.get_by_text("Sheet 1 · Letters" if sheet == 1 else "Sheet 2 · Marks").click()
            pg.get_by_test_id("photo-input").set_input_files(str(PHOTOS / name))
            pg.wait_for_selector("[data-testid=summary]", timeout=60000)
            pg.get_by_test_id("use-letters").click()
            pg.wait_for_selector("[data-testid=saved-summary]")
        proj = pg.evaluate(READ)
        b.close()
    return proj


def main():
    proj = project()
    # hand adjustments of every kind, chosen to be easy to see
    g = proj["glyphs"]
    proj["markOffsets"] = {"0791|07A6": {"dx": 35, "dy": 22}, "0788|07A8": {"dx": -20, "dy": 40}, "0784|07AA": {"dx": 10, "dy": -30}}
    proj["spacing"] = {"all": 12, "side": {"0788": {"left": 25, "right": 40}, "0784": {"left": -10, "right": 15}},
                       "pairs": {"0788|0780": 30, "078B|0780": -25}}
    tmp = Path(tempfile.mkdtemp())
    (tmp / "p.json").write_text(json.dumps(proj))
    subprocess.run(["npx", "tsx", "scripts/parity.ts", str(tmp / "p.json"), str(tmp / "o.json")], cwd=ROOT / "web", check=True)
    out = json.loads((tmp / "o.json").read_text())
    req = urllib.request.Request(f"{BUILDER}/handwriting/build", json.dumps(out["body"]).encode(), {"content-type": "application/json"})
    with urllib.request.urlopen(req) as r:
        ttf = r.read()
    font = TTFont(io.BytesIO(ttf))
    hbf = hb.Font(hb.Face(hb.Blob(ttf)))
    gset = font.getGlyphSet()
    worst = 0
    for word, parts in out["layout"].items():
        buf = hb.Buffer(); buf.add_str(word); buf.direction, buf.script, buf.language = "rtl", "thaa", "dv"
        hb.shape(hbf, buf, {})
        x, got = 0, []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            name = font.getGlyphName(info.codepoint)
            gl = font["glyf"][name]
            if name.startswith("uni") and gl.numberOfContours:
                bp = BoundsPen(gset); gset[name].draw(bp)          # true curve extents, as the page measures them
                x0, y0, x1, y1 = bp.bounds
                ox = x + pos.x_offset
                got.append((name[3:], ox + x0, pos.y_offset + y0, ox + x1, pos.y_offset + y1))
            x += pos.x_advance
        # the page lays out from the right edge; the font from the left. Compare after lining up the left-most ink.
        want = [(p["id"], p["x0"], p["y0"], p["x1"], p["y1"]) for p in parts]
        assert len(got) == len(want), (word, len(got), len(want))
        dx = min(w[1] for w in want) - min(g[1] for g in got)
        got.sort(key=lambda t: (t[1], t[0])); want.sort(key=lambda t: (t[1] - dx * 0, t[0]))
        got = [(i, a + dx, b, c + dx, d) for i, a, b, c, d in got]
        for g_, w_ in zip(sorted(got, key=lambda t: (t[0], t[1])), sorted(want, key=lambda t: (t[0], t[1]))):
            assert g_[0] == w_[0], (word, g_, w_)
            d = max(abs(g_[k] - w_[k]) for k in range(1, 5))
            worst = max(worst, d)
            assert d <= 3, (word, g_, w_)
    print(f"preview matches the font: worst difference {worst:.1f} units over {sum(len(v) for v in out['layout'].values())} glyphs")


main()
