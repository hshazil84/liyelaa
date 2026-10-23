"""Vowel marks step: import synthetic photos, place marks per letter, and check the saved nudge reaches the font.
Needs web on :3000 and builder on :8000.   python3 e2e/anchors_flow.py <dir with the synthetic photos>"""
import io, json, os, sys, urllib.request, zipfile
from pathlib import Path
from fontTools.ttLib import TTFont
from playwright.sync_api import sync_playwright

PHOTOS = Path(sys.argv[1])
WEB = os.environ.get("WEB_URL", "http://localhost:3000")
BUILDER = os.environ.get("BUILDER_URL", "http://localhost:8000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
READ = """() => new Promise((res) => { const r = indexedDB.open('keyval-store');
  r.onsuccess = () => { const q = r.result.transaction('keyval').objectStore('keyval').get('dfm.handwriting.v1'); q.onsuccess = () => res(q.result || null); }; })"""


def build(glyphs, offsets):
    body = json.dumps({"name": "Anchor Test", "author": "Test", "glyphs": glyphs, "fallback": "none", "format": "ttf",
                       "mark_offsets": offsets}).encode()
    with urllib.request.urlopen(urllib.request.Request(f"{BUILDER}/handwriting/build", body, {"content-type": "application/json"})) as r:
        return TTFont(io.BytesIO(r.read()))


def mark_y(font, base_id, mark_id):
    """Where the mark's glyph sits above the baseline once positioned, read from GPOS via the feature compiler's own anchors."""
    gpos = font["GPOS"].table
    base, mark = f"uni{base_id}", f"uni{mark_id}"
    for lookup in gpos.LookupList.Lookup:
        for st in lookup.SubTable:
            if st.LookupType != 4:
                continue
            cov = st.BaseCoverage.glyphs
            if base not in cov:
                continue
            mcls = st.MarkCoverage.glyphs
            if mark not in mcls:
                continue
            mrec = st.MarkArray.MarkRecord[mcls.index(mark)]
            brec = st.BaseArray.BaseRecord[cov.index(base)]
            ba = brec.BaseAnchor[mrec.Class]
            if ba is None:
                continue
            return ba.XCoordinate, ba.YCoordinate
    raise AssertionError("no anchor")


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 1000}).new_page()
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
        pg.get_by_test_id("continue-letters").click()
        pg.wait_for_url("**/handwriting/letters")
        pg.get_by_test_id("level-here").click()
        pg.wait_for_url("**/handwriting/level")
        pg.get_by_test_id("continue-tails").click()
        pg.wait_for_url("**/handwriting/tails")
        pg.get_by_test_id("continue-anchors").click()
        pg.wait_for_url("**/handwriting/anchors")
        pg.wait_for_selector("[data-testid=anchor-dot]")
        pg.screenshot(path=str(PHOTOS / "anchors-1.png"))

        letters = pg.locator("[data-letter]").count()
        marks = pg.locator("[data-mark]").count()
        total = letters * marks
        assert letters >= 30 and marks >= 8, (letters, marks)
        assert pg.get_by_test_id("flag-count").inner_text().endswith(f"of {total}")

        # pick a letter and an above mark, then move the dot by dragging
        pg.locator('[data-letter="0784"]').click()
        pg.locator('[data-mark="07A6"]').click()
        dot = pg.get_by_test_id("anchor-dot")
        bb = dot.bounding_box()
        cx, cy = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
        mark_before = pg.get_by_test_id("placed-mark").bounding_box()
        pg.mouse.move(cx, cy)
        pg.mouse.down()
        pg.mouse.move(cx + 40, cy - 30, steps=6)
        pg.mouse.up()
        mark_after = pg.get_by_test_id("placed-mark").bounding_box()
        assert mark_after["x"] - mark_before["x"] > 25 and mark_before["y"] - mark_after["y"] > 15, (mark_before, mark_after)

        # nudge with the keyboard and the buttons
        dot.focus()
        pg.keyboard.press("ArrowRight")
        pg.get_by_role("button", name="Nudge up").click()
        pg.wait_for_timeout(500)
        saved = pg.evaluate(READ)["markOffsets"]
        assert list(saved) == ["0784|07A6"], saved
        off = saved["0784|07A6"]
        assert off["dx"] > 0 and off["dy"] > 0, off

        # another mark on the same letter, and the same mark on another letter, are untouched
        pg.locator('[data-mark="07A7"]').click()
        assert pg.get_by_role("button", name="Reset to auto").is_disabled()
        pg.locator('[data-letter="0785"]').click()
        pg.locator('[data-mark="07A6"]').click()
        assert pg.get_by_role("button", name="Reset to auto").is_disabled()

        # reload: the nudge is still there
        pg.reload()
        pg.wait_for_selector("[data-testid=anchor-dot]")
        pg.locator('[data-letter="0784"]').click()
        pg.locator('[data-mark="07A6"]').click()
        assert pg.get_by_role("button", name="Reset to auto").is_enabled()
        pg.screenshot(path=str(PHOTOS / "anchors-2.png"))

        # the saved nudge reaches the font: the anchor on this letter for this mark moves by exactly dx, dy
        proj = pg.evaluate(READ)
        glyphs = [{k: g[k] for k in ("id", "cp", "contours", "adv")} for g in proj["glyphs"].values()]
        offs = [{"base": "0784", "mark": "07A6", "dx": off["dx"], "dy": off["dy"]}]
        plain = mark_y(build(glyphs, []), "0784", "07A6")
        moved = mark_y(build(glyphs, offs), "0784", "07A6")
        assert (moved[0] - plain[0], moved[1] - plain[1]) == (off["dx"], off["dy"]), (plain, moved, off)
        other = (mark_y(build(glyphs, []), "0785", "07A6"), mark_y(build(glyphs, offs), "0785", "07A6"))
        assert other[0] == other[1]

        # reset clears it
        pg.get_by_role("button", name="Reset to auto").click()
        pg.wait_for_timeout(500)
        assert not (pg.evaluate(READ).get("markOffsets") or {})
        assert not errors, errors
        print(f"anchors ok: {letters} letters x {marks} marks, flagged {pg.get_by_test_id('flag-count').inner_text()}, nudge ({off['dx']},{off['dy']}) reached the font")
        b.close()


main()
