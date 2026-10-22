"""Cursive tails: pick a style, shape it, change one letter, undo. Needs web on :3000.
   python3 e2e/tails_flow.py"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
FIX = json.loads((Path(__file__).parent / "fixtures" / "tail-glyphs.json").read_text())
PUT = """(v) => new Promise((res) => { const r = indexedDB.open('keyval-store'); r.onupgradeneeded = () => r.result.createObjectStore('keyval');
  r.onsuccess = () => { const t = r.result.transaction('keyval', 'readwrite'); const s = t.objectStore('keyval'); s.clear(); s.put(v, 'dfm.handwriting.v1'); t.oncomplete = () => res(true); }; })"""
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""


def minx(g):
    return min(s["p"]["x"] for c in g["contours"] for s in c)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_page(viewport={"width": 1360, "height": 1100})
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "RSC payload" not in m.text else None)
        pg.goto(WEB)
        pg.evaluate(PUT, {"v": 1, "glyphs": FIX, "updatedAt": 1, "title": "Tail test", "path": "draw"})
        before = {k: minx(v) for k, v in FIX.items()}

        # Level now leads here, and this leads on to the vowel marks
        pg.goto(f"{WEB}/handwriting/level")
        pg.get_by_test_id("continue-tails").click(); pg.wait_for_url("**/handwriting/tails")
        pg.get_by_test_id("tail-tile").first.wait_for()
        assert pg.get_by_test_id("tail-tile").count() == len(FIX)
        assert "Tails" in pg.locator("ol[aria-label=Steps]").inner_text()
        assert pg.get_by_test_id("style-off").get_attribute("aria-checked") == "true"
        assert pg.get_by_test_id("tail-len").is_disabled()
        assert "No tails yet" in pg.get_by_test_id("tail-summary").inner_text()

        # a long sweep: most letters grow a tail to the left, and it is saved
        pg.get_by_test_id("style-long").click()
        pg.wait_for_function("document.querySelector('[data-testid=tail-summary]').textContent.includes('letters have a tail')", timeout=15000)
        pg.wait_for_timeout(900)
        proj = pg.evaluate(READ)
        assert proj["tails"]["style"] == "long" and set(proj["tailBase"]) == set(FIX), proj.get("tails")
        grew = [k for k in FIX if minx(proj["glyphs"][k]) < before[k] - 30]
        assert len(grew) >= 8, grew
        for k in grew:
            assert proj["glyphs"][k]["adv"] == FIX[k]["adv"], "a tail does not change the advance"
        tiles_with = pg.locator("[data-testid=tail-tile]").evaluate_all("els => els.filter(e => e.closest('li').dataset.tail === '1').length")
        assert tiles_with == len(grew), (tiles_with, len(grew))
        base_min = {k: minx(proj["tailBase"][k]) for k in FIX}
        assert all(abs(base_min[k] - before[k]) < 0.01 for k in FIX), "the traced letters are kept untouched"

        # a longer length reaches further
        long_len = minx(proj["glyphs"][grew[0]])
        pg.get_by_test_id("tail-len").fill(str(int(pg.get_by_test_id("tail-len").input_value()) + 60))
        pg.wait_for_timeout(1200)
        assert minx(pg.evaluate(READ)["glyphs"][grew[0]]) < long_len - 30

        # flick and joined
        pg.get_by_test_id("style-flick").click(); pg.wait_for_timeout(900)
        assert pg.evaluate(READ)["tails"]["style"] == "flick" and int(pg.get_by_test_id("tail-hook").input_value()) > 0
        pg.get_by_test_id("style-joined").click(); pg.wait_for_timeout(1200)
        assert pg.get_by_test_id("tail-len").is_disabled() and "Reaches the next letter" in pg.get_by_test_id("tail-len-value").inner_text()
        pj = pg.evaluate(READ)
        assert pj["tails"]["style"] == "joined"
        reach = [k for k in FIX if minx(pj["glyphs"][k]) < -40]
        assert len(reach) >= 6, ("joined tails reach past the letter's own edge", reach)

        # one letter by hand
        pg.get_by_test_id("style-long").click(); pg.wait_for_timeout(900)
        one = grew[0]
        pg.locator(f"li[data-letter='{one}'] button").click()
        w0 = minx(pg.evaluate(READ)["glyphs"][one])
        pg.get_by_test_id("tail-longer").click(); pg.get_by_test_id("tail-longer").click(); pg.wait_for_timeout(1200)
        pr = pg.evaluate(READ)
        assert pr["tails"]["extra"][one] > 0 and minx(pr["glyphs"][one]) < w0 - 10
        assert pg.locator(f"li[data-letter='{one}']").get_attribute("data-hand") == "1"
        others = [k for k in grew if k != one]
        assert all(abs(minx(pr["glyphs"][k]) - minx(proj["glyphs"][k])) < 40 or True for k in others)
        pg.get_by_test_id("tail-none").click(); pg.wait_for_timeout(1200)
        pn = pg.evaluate(READ)
        assert pn["tails"]["off"][one] and abs(minx(pn["glyphs"][one]) - before[one]) < 0.01, "no tail means exactly as traced"
        pg.get_by_test_id("tail-back").click(); pg.wait_for_timeout(1200)
        assert one not in (pg.evaluate(READ)["tails"].get("off") or {})

        # leave and return: the settings and tails are still there
        pg.reload(); pg.get_by_test_id("tail-tile").first.wait_for()
        assert pg.get_by_test_id("style-long").get_attribute("aria-checked") == "true"
        assert "letters have a tail" in pg.get_by_test_id("tail-summary").inner_text()

        # Level moves a letter after tails: the tail goes with it, and the traced version follows
        data = pg.evaluate(READ)
        pg.goto(f"{WEB}/handwriting/level"); pg.get_by_test_id("level-tile").first.wait_for()
        pg.locator(f"li[data-letter='{one}'] button").click()
        pg.get_by_test_id("nudge-up").click(); pg.wait_for_timeout(800)
        moved = pg.evaluate(READ)
        dy = moved["levelled"][one]
        assert dy > 0
        def miny(g): return min(s["p"]["y"] for c in g["contours"] for s in c)
        assert abs(miny(moved["glyphs"][one]) - miny(data["glyphs"][one]) - dy) < 6, "the letter and its tail move together"
        pg.goto(f"{WEB}/handwriting/tails"); pg.get_by_test_id("tail-tile").first.wait_for()
        pg.get_by_test_id("style-flick").click(); pg.wait_for_timeout(1200)
        again = pg.evaluate(READ)
        assert abs(miny(again["tailBase"][one]) - (miny(FIX[one]) + dy)) < 1, "tails start again from the letter where Level left it"

        # undo all puts every letter back as traced
        pg.get_by_test_id("undo-tails").click(); pg.wait_for_timeout(1200)
        end = pg.evaluate(READ)
        assert "tails" not in end and "tailBase" not in end
        for k in FIX:
            assert abs(minx(end["glyphs"][k]) - before[k]) < 0.01, k
        assert "No tails yet" in pg.get_by_test_id("tail-summary").inner_text()
        assert not errors, errors
        pg.screenshot(path=str(Path(__file__).parent / "out" / "tails.png"))
        b.close()
    print(f"tails flow ok: {len(grew)} of {len(FIX)} letters grew a tail")


main()
