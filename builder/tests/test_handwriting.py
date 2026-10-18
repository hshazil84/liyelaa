import io
import os
import tempfile
import zipfile

import ots
import pytest
import uharfbuzz as hb
from fontTools.pens.areaPen import AreaPen
from fontTools.ttLib import TTFont

from fontmaker.handwriting import (
    BuildRequest, GlyphIn, KernIn, LigatureIn, MarkOffsetIn, Pt, Seg, build_handwriting_font, build_zip,
)
from fontmaker.play import font_bytes

Z = Pt(x=0, y=0)


def rect(x0, y0, x1, y1, reverse=False):
    pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    if reverse:
        pts.reverse()
    return [Seg(p=Pt(x=x, y=y), hi=Z, ho=Z) for x, y in pts]


def circle(cx, cy, r):
    k = 0.5523 * r
    pts = [((cx + r, cy), (0, -k), (0, k)), ((cx, cy + r), (k, 0), (-k, 0)),
           ((cx - r, cy), (0, k), (0, -k)), ((cx, cy - r), (-k, 0), (k, 0))]
    return [Seg(p=Pt(x=p[0], y=p[1]), hi=Pt(x=hi[0], y=hi[1]), ho=Pt(x=ho[0], y=ho[1])) for p, hi, ho in pts]


def G(cp, contours, adv=400):
    return GlyphIn(id=f"{cp:04X}", cp=[cp], contours=contours, adv=adv)


BA, KA = 0x0784, 0x0785
FILI_A, IBI = 0x07A6, 0x07A8
BASE_GLYPHS = [
    G(BA, [rect(40, 0, 300, 400)], 380),
    G(KA, [rect(40, -60, 300, 300)], 380),
    G(FILI_A, [rect(-30, 350, 30, 400)], 0),          # drawn 8 units above the template box (top at 342)
    G(IBI, [rect(-30, -80, 30, -30)], 0),             # drawn 30 units below the baseline
]


def build(glyphs=None, **kw):
    kw.setdefault("fallback", "none")
    font, report = build_handwriting_font(BuildRequest(glyphs=glyphs if glyphs is not None else BASE_GLYPHS, **kw))
    return TTFont(io.BytesIO(font_bytes(font, None))), report


def shape(font, text):
    hbf = hb.Font(hb.Face(hb.Blob(font_bytes(font, None))))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.direction, buf.script, buf.language = "rtl", "thaa", "dv"
    hb.shape(hbf, buf, {})
    return buf.glyph_infos, buf.glyph_positions


def placed(font, text):
    """Name and absolute ink box of every shaped glyph."""
    infos, poss = shape(font, text)
    x, out = 0, []
    for info, pos in zip(infos, poss):
        name = font.getGlyphName(info.codepoint)
        g = font["glyf"][name]
        box = None
        if g.numberOfContours:
            ox = x + pos.x_offset
            box = (ox + g.xMin, pos.y_offset + g.yMin, ox + g.xMax, pos.y_offset + g.yMax)
        out.append((name, box, pos.x_advance))
        x += pos.x_advance
    return out


def ink(font, name):
    g = font["glyf"][name]
    return g.xMin, g.yMin, g.xMax, g.yMax


# ----------------------------------------------------------------------------- outlines
def test_font_is_valid_and_has_the_drawn_glyphs():
    font, report = build()
    cmap = font.getBestCmap()
    assert cmap[BA] == "uni0784" and cmap[FILI_A] == "uni07A6" and cmap[0x20] == "space"
    assert report["drawn"] == ["0784", "0785", "07A6", "07A8"] and report["filled_from_starter"] == []
    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, "a.ttf"), os.path.join(d, "b.ttf")
        open(src, "wb").write(font_bytes(font, None))
        r = ots.sanitize(src, dst, capture_output=True)
        assert r.returncode == 0, r.stderr


def test_marks_have_no_width_and_letters_keep_their_advance():
    font, _ = build()
    assert font["hmtx"]["uni07A6"][0] == 0 and font["hmtx"]["uni0784"][0] == 380


def test_overlapping_shapes_become_one_and_holes_survive():
    overlap = G(BA, [rect(0, 0, 200, 200), rect(100, 100, 300, 300)])
    font, _ = build([overlap])
    assert font["glyf"]["uni0784"].numberOfContours == 1
    # an inner shape wound the same way is part of the fill (as the editor shows it) ...
    same = G(BA, [rect(0, 0, 300, 300), rect(100, 100, 200, 200)])
    font, _ = build([same])
    assert font["glyf"]["uni0784"].numberOfContours == 1
    # ... and one wound the opposite way is a hole
    ring = G(BA, [rect(0, 0, 300, 300), rect(100, 100, 200, 200, reverse=True)])
    font, _ = build([ring])
    assert font["glyf"]["uni0784"].numberOfContours == 2
    gs = font.getGlyphSet()
    pen = AreaPen(gs)
    gs["uni0784"].draw(pen)
    assert pen.value == pytest.approx(-(300 * 300 - 100 * 100), abs=1)      # clockwise outer, counter-clockwise hole


def test_curves_become_quadratic_and_keep_their_size():
    font, _ = build([G(BA, [circle(200, 200, 150)])])
    g = font["glyf"]["uni0784"]
    assert any(f & 1 == 0 for f in g.flags), "expected off-curve points"
    assert (g.xMin, g.yMin, g.xMax, g.yMax) == pytest.approx((50, 50, 350, 350), abs=3)


def test_shape_not_drawn_is_left_out():
    font, report = build([G(BA, []), *BASE_GLYPHS[1:]])
    assert 0x0784 not in font.getBestCmap() and "0784" not in report["drawn"]


# ----------------------------------------------------------------------------- vowel marks
def test_mark_above_follows_the_letter_top():
    font, _ = build()
    for base, top in ((BA, 400), (KA, 300)):
        out = placed(font, chr(base) + chr(FILI_A))
        mark = next(b for n, b, _ in out if n == "uni07A6")
        letter = next(b for n, b, _ in out if n == f"uni{base:04X}")
        assert (mark[0] + mark[2]) / 2 == pytest.approx((letter[0] + letter[2]) / 2, abs=1.5)
        assert mark[1] - letter[3] == pytest.approx(350 - 342, abs=1.5), "keeps its drawn distance from the top"
        assert letter[3] == top


def test_mark_below_follows_the_letter_bottom():
    font, _ = build()
    for base in (BA, KA):
        out = placed(font, chr(base) + chr(IBI))
        mark = next(b for n, b, _ in out if n == "uni07A8")
        letter = next(b for n, b, _ in out if n == f"uni{base:04X}")
        assert mark[3] - letter[1] == pytest.approx(-30, abs=1.5)
        assert (mark[0] + mark[2]) / 2 == pytest.approx((letter[0] + letter[2]) / 2, abs=1.5)


def test_anchor_override_moves_the_mark():
    from fontmaker.handwriting import AnchorIn
    font, _ = build(anchors={"0784": AnchorIn(top=Pt(x=250, y=420))})
    out = placed(font, chr(BA) + chr(FILI_A))
    mark = next(b for n, b, _ in out if n == "uni07A6")
    assert (mark[0] + mark[2]) / 2 == pytest.approx(250, abs=1.5)
    assert mark[1] == pytest.approx(420 + 8, abs=1.5)


def test_offset_moves_one_mark_on_one_letter_only():
    font, _ = build(mark_offsets=[MarkOffsetIn(base="0784", mark="07A6", dx=40, dy=25)])
    plain, _ = build()
    def mark_box(f, base):
        out = placed(f, chr(base) + chr(FILI_A))
        return next(b for n, b, _ in out if n == "uni07A6")
    moved, ref = mark_box(font, BA), mark_box(plain, BA)
    assert moved[0] - ref[0] == pytest.approx(40, abs=1.5) and moved[1] - ref[1] == pytest.approx(25, abs=1.5)
    assert mark_box(font, KA) == mark_box(plain, KA), "the other letter is untouched"


def test_offset_for_one_mark_leaves_the_other_marks_alone():
    font, _ = build(mark_offsets=[MarkOffsetIn(base="0784", mark="07A8", dx=0, dy=-50)])
    plain, _ = build()
    def box(f, mark):
        out = placed(f, chr(BA) + chr(mark))
        return next(b for n, b, _ in out if n == f"uni{mark:04X}")
    assert box(font, IBI)[1] - box(plain, IBI)[1] == pytest.approx(-50, abs=1.5)
    assert box(font, FILI_A) == box(plain, FILI_A)


def test_offsets_for_unknown_glyphs_are_ignored():
    font, _ = build(mark_offsets=[MarkOffsetIn(base="FFFF", mark="07A6", dx=90, dy=90),
                                  MarkOffsetIn(base="0784", mark="0785", dx=90, dy=90)])
    plain, _ = build()
    assert placed(font, chr(BA) + chr(FILI_A)) == placed(plain, chr(BA) + chr(FILI_A))


# ----------------------------------------------------------------------------- features
def test_ligature_replaces_a_sequence():
    lig = LigatureIn(id="ba-sukun", sequence=[BA, 0x07B0], contours=[rect(0, 0, 500, 300)], adv=540)
    glyphs = BASE_GLYPHS + [G(0x07B0, [rect(-20, 350, 20, 390)], 0)]
    font, report = build(glyphs, ligatures=[lig])
    out = placed(font, chr(BA) + chr(0x07B0))
    assert [n for n, _, _ in out] == ["lig_basukun"] and out[0][2] == 540
    assert report["ligatures"] == 1
    assert [n for n, _, _ in placed(font, chr(BA))] == ["uni0784"], "the letter alone is unchanged"


def test_quotation_marks_swap_in_right_to_left_text():
    glyphs = BASE_GLYPHS + [G(0x201C, [rect(0, 300, 100, 400)], 150), G(0x201D, [rect(0, 300, 100, 380)], 150)]
    font, _ = build(glyphs)
    assert [n for n, _, _ in placed(font, "“")] == ["uni201D"]
    assert [n for n, _, _ in placed(font, "”")] == ["uni201C"]


def test_latin_comma_semicolon_question_show_the_arabic_forms():
    glyphs = BASE_GLYPHS + [G(0x060C, [rect(0, -50, 60, 60)], 120), G(0x061F, [rect(0, 0, 200, 400)], 260)]
    font, _ = build(glyphs)
    cmap = font.getBestCmap()
    assert cmap[0x2C] == "uni060C" and cmap[0x3F] == "uni061F" and 0x3B not in cmap


def test_kerning_pair_changes_the_gap_between_the_two_letters_only():
    """Right-to-left: the typed order is first letter on the right. Only the gap inside the pair may change."""
    text = chr(BA) + chr(KA) + chr(BA)           # on screen, left to right: BA KA BA
    plain, _ = build()
    kerned, report = build(kerning=[KernIn(left="0785", right="0784", value=-30)])
    def gaps(font):
        boxes = [b for _, b, _ in placed(font, text)]          # shaped order is left to right on screen
        return [boxes[1][0] - boxes[0][2], boxes[2][0] - boxes[1][2]]      # left gap, right gap
    pg, kg = gaps(plain), gaps(kerned)
    assert kg[0] - pg[0] == -30, "gap inside the pair moved"
    assert kg[1] - pg[1] == 0, "the other gap is untouched"
    assert report["kern_pairs"] == 1


def test_kerning_works_through_a_vowel_mark_and_the_mark_follows_its_letter():
    text = chr(BA) + chr(FILI_A) + chr(KA)           # a letter, its vowel mark, then the next letter
    plain, _ = build()
    kerned, _ = build(kerning=[KernIn(left="0784", right="0785", value=50)])
    p, k = placed(plain, text), placed(kerned, text)
    letter = lambda o, n: next(b for name, b, _ in o if name == n)
    assert letter(k, "uni0784")[0] - letter(p, "uni0784")[0] == 50 and letter(k, "uni0785") == letter(p, "uni0785")
    mark_p, mark_k = letter(p, "uni07A6"), letter(k, "uni07A6")
    assert mark_k[0] - mark_p[0] == 50, "the mark stays on its letter"


def test_positive_kerning_opens_the_gap_and_the_line_grows_by_that_much():
    plain, _ = build()
    kerned, _ = build(kerning=[KernIn(left="0784", right="0785", value=45)])
    p, k = placed(plain, chr(BA) + chr(KA)), placed(kerned, chr(BA) + chr(KA))
    gap = lambda o: o[1][1][0] - o[0][1][2]
    assert gap(k) - gap(p) == 45
    assert sum(a for *_, a in k) - sum(a for *_, a in p) == 45


def test_spacing_adds_to_letters_not_marks():
    font, _ = build(spacing=25)
    assert font["hmtx"]["uni0784"][0] == 405 and font["hmtx"]["uni07A6"][0] == 0


# ----------------------------------------------------------------------------- starter font
def test_starter_font_fills_missing_letters_and_marks_attach():
    font, report = build(fallback="noto")
    cmap = font.getBestCmap()
    assert all(cp in cmap for cp in range(0x0780, 0x07B2))
    for cp in (0xFDFD, 0xFDF2, 0x060C, 0x061B, 0x061F):
        assert cp in cmap
    assert "0784" not in report["filled_from_starter"] and "0786" in report["filled_from_starter"]
    # a starter-font mark sits above a starter-font letter, not inside it
    out = placed(font, chr(0x0786) + chr(0x07A7))
    mark = next(b for n, b, _ in out if n == "uni07A7")
    letter = next(b for n, b, _ in out if n == "uni0786")
    assert mark[1] >= letter[3] + 20
    assert (mark[0] + mark[2]) / 2 == pytest.approx((letter[0] + letter[2]) / 2, abs=2)
    # and a starter-font mark below
    out = placed(font, chr(0x0786) + chr(0x07A9))
    mark = next(b for n, b, _ in out if n == "uni07A9")
    letter = next(b for n, b, _ in out if n == "uni0786")
    assert mark[3] <= letter[1] - 20


def test_starter_letters_are_scaled_to_the_handwriting():
    tall = [G(cp, [rect(40, 0, 300, 900)], 380) for cp in range(0x0780, 0x0784)]
    small = [G(cp, [rect(40, 0, 300, 200)], 380) for cp in range(0x0780, 0x0784)]
    a, _ = build(tall, fallback="noto")
    b, _ = build(small, fallback="noto")
    h = lambda f: f["glyf"]["uni0790"].yMax - f["glyf"]["uni0790"].yMin
    assert h(b) < h(a)


def test_private_licence_cannot_use_the_open_starter_font():
    with pytest.raises(ValueError):
        build_handwriting_font(BuildRequest(glyphs=BASE_GLYPHS, fallback="noto", licence="private"))


def test_name_is_cleaned_and_font_is_renamed():
    font, _ = build(name="  <b>Mine</b> ހ ", author="Ali")
    assert font["name"].getDebugName(1) == "bMineb"
    assert "Ali" in font["name"].getDebugName(13)


def test_designer_details_reach_the_name_table_and_version():
    font, _ = build(name="Ali Hand", author="Ali  Rasheed\n", website="ali.mv", description="Round and friendly.", version="2.5")
    n = font["name"]
    assert n.getDebugName(9) == "Ali Rasheed"
    assert n.getDebugName(12) == "https://ali.mv"
    assert n.getDebugName(10) == "Round and friendly."
    assert n.getDebugName(5) == "Version 2.500"
    assert font["head"].fontRevision == pytest.approx(2.5)
    assert n.getDebugName(0).startswith("Copyright (c)") and "Ali Rasheed" in n.getDebugName(0)


def test_designer_details_are_optional():
    font, _ = build()
    assert font["name"].getDebugName(12) is None
    assert font["name"].getDebugName(5) == "Version 1.000"
    assert "Made with Dhivehi Font Maker" in font["name"].getDebugName(10)


@pytest.mark.parametrize("kw", [{"website": "not a site"}, {"website": "ftp://x.mv"}, {"website": "nodots"}, {"version": "v2"}, {"version": "1.2345"}])
def test_bad_designer_details_are_rejected(kw):
    with pytest.raises(ValueError):
        BuildRequest(glyphs=BASE_GLYPHS, **kw)


def test_zip_readme_and_licence_carry_the_designer_details():
    data, _, _ = build_zip(BuildRequest(glyphs=BASE_GLYPHS, name="Ali Hand", author="Ali", website="ali.mv",
                                        description="Round and friendly.", version="1.2", fallback="none"))
    z = zipfile.ZipFile(io.BytesIO(data))
    readme, ofl = z.read("README.txt").decode(), z.read("OFL.txt").decode()
    assert "Ali Hand 1.200" in readme and "Designed by Ali" in readme and "https://ali.mv" in readme and "Round and friendly." in readme
    assert "https://ali.mv" in ofl


# ----------------------------------------------------------------------------- download
def test_zip_has_fonts_readme_and_licences():
    req = BuildRequest(glyphs=BASE_GLYPHS, name="Ali Hand", author="Ali", fallback="noto")
    data, slug, report = build_zip(req)
    z = zipfile.ZipFile(io.BytesIO(data))
    assert {"Ali-Hand.ttf", "Ali-Hand.woff2", "OFL.txt", "README.txt"} <= set(z.namelist())
    ofl = z.read("OFL.txt").decode()
    assert ofl.startswith("Copyright (c)") and "Ali" in ofl and "Noto Project Authors" in ofl and "SIL OPEN FONT LICENSE" in ofl
    assert TTFont(io.BytesIO(z.read("Ali-Hand.woff2"))).flavor == "woff2"


def test_private_zip_has_no_open_licence_file():
    data, _, _ = build_zip(BuildRequest(glyphs=BASE_GLYPHS, licence="private", fallback="none"))
    z = zipfile.ZipFile(io.BytesIO(data))
    assert "OFL.txt" not in z.namelist() and "All rights reserved" in z.read("README.txt").decode()
