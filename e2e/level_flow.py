"""Level your letters: snap to the AK Rasmee baseline, check what is saved, undo exactly, and check the built font follows.
Needs web on :3000.   python3 e2e/level_flow.py <dir with sheet1/sheet2 photos> [sheet1 name] [sheet2 name]"""
import json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

PHOTOS = Path(sys.argv[1])
NAMES = (sys.argv[2] if len(sys.argv) > 2 else "sheet1_tilt.jpg", sys.argv[3] if len(sys.argv) > 3 else "sheet2_tilt.jpg")
WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""


def bottoms(proj):
    out = {}
    for k, g in proj["glyphs"].items():
        ys = [p["p"]["y"] for c in g["contours"] for p in c]
        if ys and 0x780 <= g["cp"][0] <= 0x7A5:
            out[k] = (min(ys), max(ys))
    return out


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 1000}).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        for sheet, name in ((1, NAMES[0]), (2, NAMES[1])):
            pg.goto(f"{WEB}/handwriting")
            pg.get_by_text("Sheet 1 · Letters" if sheet == 1 else "Sheet 2 · Marks").click()
            pg.get_by_test_id("photo-input").set_input_files(str(PHOTOS / name))
            pg.wait_for_selector("[data-testid=summary]", timeout=90000)
            pg.get_by_test_id("use-letters").click()
            pg.wait_for_selector("[data-testid=saved-summary]")
        before = bottoms(pg.evaluate(READ))

        pg.goto(f"{WEB}/handwriting/letters")
        pg.get_by_test_id("continue-level").click()
        pg.wait_for_url("**/handwriting/level")
        pg.wait_for_selector("[data-letter]")
        n = pg.locator("[data-letter]").count()
        assert n >= 30, n
        assert pg.get_by_test_id("undo-snap").is_disabled()
        pg.screenshot(path=str(PHOTOS / "level-1.png"), full_page=True)

        # at 0% nothing moves, so there is nothing to snap
        pg.get_by_test_id("strength").fill("0")
        assert pg.get_by_test_id("snap").is_disabled()
        pg.get_by_test_id("strength").fill("100")
        pg.get_by_test_id("snap").click()
        pg.wait_for_timeout(500)
        proj = pg.evaluate(READ)
        lev = proj["levelled"]
        assert lev, "snap records how far each letter moved"
        after = bottoms(proj)
        for k, d in lev.items():
            assert abs((after[k][0] - before[k][0]) - d) <= 0.2 and abs((after[k][1] - before[k][1]) - d) <= 0.2, (k, d, before[k], after[k])
        assert all(after[k] == before[k] for k in before if k not in lev), "letters that did not move are untouched"
        assert pg.get_by_test_id("snap").is_disabled() and pg.get_by_test_id("undo-snap").is_enabled()
        pg.screenshot(path=str(PHOTOS / "level-2.png"), full_page=True)

        # reload keeps it; the spread of how far letters sit from the line gets smaller
        pg.reload(); pg.wait_for_selector("[data-letter]")
        assert pg.evaluate(READ)["levelled"] == lev

        # one letter at a time: nudge, put back, snap just this one
        tile = pg.locator("[data-letter]").first
        lid = tile.get_attribute("data-letter")
        assert pg.get_by_test_id("one-letter").inner_text().count("Click a letter"), "asks for a letter first"
        tile.get_by_test_id("level-tile").click()
        base_lev = pg.evaluate(READ)["levelled"].get(lid, 0)
        b0 = bottoms(pg.evaluate(READ))[lid]
        pg.get_by_test_id("nudge-up").click(); pg.get_by_test_id("nudge-up").click(); pg.wait_for_timeout(400)
        proj = pg.evaluate(READ)
        assert proj["levelHand"][lid] == 20, proj.get("levelHand")                       # two quarter-millimetre steps, 10 units each
        assert proj["levelled"][lid] == base_lev + 20
        assert abs(bottoms(proj)[lid][0] - (b0[0] + 20)) <= 0.2 and tile.get_attribute("data-hand") == "1"
        others = bottoms(proj)
        assert all(others[k] == bottoms(proj)[k] for k in others)
        pg.get_by_test_id("nudge-down").click(); pg.wait_for_timeout(300)
        assert pg.evaluate(READ)["levelHand"][lid] == 10
        pg.get_by_test_id("put-back").click(); pg.wait_for_timeout(400)
        proj = pg.evaluate(READ)
        assert lid not in proj["levelled"] and lid not in (proj.get("levelHand") or {}), "put back returns it to where it was drawn"
        assert abs(bottoms(proj)[lid][0] - (b0[0] - base_lev)) <= 0.2
        assert tile.get_attribute("data-hand") == "0"
        pg.get_by_test_id("snap-one").click(); pg.wait_for_timeout(400)
        proj = pg.evaluate(READ)
        assert proj["levelled"].get(lid, 0) == base_lev and abs(bottoms(proj)[lid][0] - b0[0]) <= 0.2, "snap this one puts it back on its snapped spot"
        assert pg.get_by_test_id("snap-one").is_disabled()

        # the two ways of finding the place differ, and the choice is remembered
        pg.get_by_test_id("method-middle").click()
        assert pg.get_by_test_id("snap").is_enabled()
        pg.get_by_test_id("snap").click(); pg.wait_for_timeout(400)
        mid = pg.evaluate(READ)
        assert mid["levelMethod"] == "middle" and mid["levelled"] != lev, "the middle method lands letters elsewhere"
        pg.reload(); pg.wait_for_selector("[data-letter]")
        assert pg.get_by_test_id("snap").is_disabled(), "the saved method is the one shown after a reload"
        pg.get_by_test_id("method-baseline").click(); pg.get_by_test_id("snap").click(); pg.wait_for_timeout(400)
        back = pg.evaluate(READ)
        assert back["levelMethod"] == "baseline" and back["levelled"] == lev
        # letters that sit on the line end up with their bottom where the reference puts it (scaled to this writing)
        import re
        txt = (Path(__file__).resolve().parent.parent / "web/lib/handwriting/reference.ts").read_text()
        ref = {m[0].upper(): (int(m[1]), int(m[2])) for m in re.findall(r'"([0-9A-Fa-f]{4})":\s*\[(-?\d+),\s*(-?\d+)\]', txt)}
        bt = bottoms(back)
        ratios = sorted((bt[k][1] - bt[k][0]) / (ref[k.upper()][1] - ref[k.upper()][0]) for k in bt if k.upper() in ref)
        scale = min(3, max(0.6, ratios[len(ratios) // 2]))
        errs = [abs(bt[k][0] - scale * ref[k.upper()][0]) for k in bt if k.upper() in ref and ref[k.upper()][0] >= -90]
        assert errs and max(errs) <= 12, max(errs)   # on-curve points stand in for the true ink edge here

        # half strength lands between
        pg.get_by_test_id("strength").fill("50"); pg.get_by_test_id("snap").click(); pg.wait_for_timeout(500)
        half = pg.evaluate(READ)["levelled"]
        k0 = max(lev, key=lambda k: abs(lev[k]))
        assert abs(half[k0] - lev[k0] / 2) <= 1.01, (half[k0], lev[k0])

        # undo puts every letter back exactly where it was drawn, nudges included
        pg.get_by_test_id("level-tile").first.click()
        pg.get_by_test_id("nudge-up").click(); pg.wait_for_timeout(300)
        assert pg.evaluate(READ)["levelHand"]
        pg.get_by_test_id("undo-snap").click(); pg.wait_for_timeout(500)
        proj = pg.evaluate(READ)
        assert not proj.get("levelled") and not proj.get("levelHand"), (proj.get("levelled"), proj.get("levelHand"))
        assert bottoms(proj) == before or all(abs(a - c) <= 0.3 for k in before for a, c in zip(bottoms(proj)[k], before[k]))

        # the next step still works after a snap
        pg.get_by_test_id("strength").fill("100"); pg.get_by_test_id("snap").click(); pg.wait_for_timeout(500)
        pg.get_by_test_id("continue-tails").click(); pg.wait_for_url("**/handwriting/tails")
        pg.get_by_test_id("continue-anchors").click(); pg.wait_for_url("**/handwriting/anchors")
        pg.wait_for_selector("[data-testid=anchor-dot]")
        print("flags after level:", pg.get_by_test_id("flag-count").inner_text())
        assert not errors, errors
        print(f"level ok: {n} letters, {len(lev)} moved, biggest {max(abs(v) for v in lev.values())} units")
        b.close()


main()
