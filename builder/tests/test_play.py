import io
import math

import pytest
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

from fontTools.pens.areaPen import AreaPen

from fontmaker.play import BASES, PlayParams, build_play_font, build_zip, font_bytes, weight_to_offset

BASE_FONT = BASES["noto"].file

TEXT = "ބުކަހް"  # a few bases with marks above and below


def shape(font: TTFont, text: str):
    data = font_bytes(font, None)
    hbf = hb.Font(hb.Face(hb.Blob(data)))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.direction, buf.script, buf.language = "rtl", "thaa", "dv"
    hb.shape(hbf, buf, {})
    return list(zip(buf.glyph_infos, buf.glyph_positions))


def origins(font: TTFont, text: str):
    """Absolute origin (x, y) of every shaped glyph, in visual order. Origins are where GPOS attaches things."""
    x = 0
    out = []
    for info, pos in shape(font, text):
        out.append((font.getGlyphName(info.codepoint), x + pos.x_offset, pos.y_offset))
        x += pos.x_advance
    return out


def reference(weight):
    return instancer.instantiateVariableFont(TTFont(BASE_FONT), {"wght": weight}, inplace=False)


def test_defaults_build_and_keep_all_thaana():
    font = build_play_font(PlayParams())
    cmap = font.getBestCmap()
    assert all(cp in cmap for cp in range(0x0780, 0x07B2))
    for cp in (0xFDFD, 0xFDF2, 0x060C, 0x061B, 0x061F):
        assert cp in cmap


@pytest.mark.parametrize("weight", [100, 400, 900])
def test_weight_changes_stroke_weight(weight):
    font = build_play_font(PlayParams(weight=weight))
    assert font["OS/2"].usWeightClass == weight
    ref = reference(weight)
    assert font["glyf"]["baathaana"].xMax == ref["glyf"]["baathaana"].xMax


def test_bold_is_wider_than_thin():
    thin, bold = build_play_font(PlayParams(weight=100)), build_play_font(PlayParams(weight=900))
    area = lambda f: sum(f["hmtx"][n][0] for n in f.getGlyphOrder())
    assert area(bold) >= area(thin)


def test_width_and_spacing_scale_advances():
    ref = reference(400)
    f = build_play_font(PlayParams(width=120, spacing=25))
    for name in ("baathaana", "kaafuthaana", "space"):
        adv = ref["hmtx"][name][0]
        assert f["hmtx"][name][0] == round(adv * 1.2) + 25
    assert f["hmtx"]["abafilithaana"][0] == 0           # marks stay zero width


@pytest.mark.parametrize("sx,slant", [(1.0, 12.0), (1.2, 0.0), (0.85, -9.0), (1.15, 8.0)])
def test_marks_stay_attached(sx, slant):
    """Every glyph origin must move exactly like the outlines do: x' = sx*x + tan(slant)*y."""
    ref = reference(400)
    new = build_play_font(PlayParams(weight=400, width=round(sx * 100), slant=slant))
    t = math.tan(math.radians(slant))
    a, b = origins(ref, TEXT), origins(new, TEXT)
    assert [n for n, _, _ in a] == [n for n, _, _ in b]
    for (na, xa, ya), (nb, xb, yb) in zip(a[1:], b[1:]):
        dxa, dya = xa - a[0][1], ya - a[0][2]
        dxb, dyb = xb - b[0][1], yb - b[0][2]
        assert dyb == pytest.approx(dya, abs=3)
        assert dxb == pytest.approx(sx * dxa + t * dya, abs=6), (na, dxa, dya, dxb)


def test_slant_sets_style_flags_consistently():
    f = build_play_font(PlayParams(weight=700, slant=10))
    sel = f["OS/2"].fsSelection
    assert sel & 0x01 and sel & 0x20 and not sel & 0x40
    assert f["post"].italicAngle < 0
    r = build_play_font(PlayParams())
    assert r["OS/2"].fsSelection & 0x40


def test_name_is_sanitised_and_renamed():
    f = build_play_font(PlayParams(name="  <b>Mine</b>  ހ "))
    fam = f["name"].getDebugName(1)
    assert fam == "bMineb"
    assert "Noto" not in fam


def test_zip_contains_fonts_and_licence():
    import zipfile
    data, slug = build_zip(PlayParams(name="My Font"))
    z = zipfile.ZipFile(io.BytesIO(data))
    assert set(z.namelist()) == {"My-Font.ttf", "My-Font.woff2", "OFL.txt", "README.txt"}
    assert slug == "My-Font"
    TTFont(io.BytesIO(z.read("My-Font.ttf")))
    TTFont(io.BytesIO(z.read("My-Font.woff2")))


def test_out_of_range_values_are_clamped():
    p = PlayParams(weight=5000, width=1, slant=99, spacing=-9999).validated()
    assert (p.weight, p.width, p.slant, p.spacing) == (900, 70, 15.0, -100)


# ----------------------------------------------------------------------------- static base: Sangu Suruhee
def sangu(**kw):
    return build_play_font(PlayParams(base="sangu", **kw))


def ref_sangu():
    return TTFont(BASES["sangu"].file)


def signed_area(font, name):
    pen = AreaPen(font.getGlyphSet())
    font.getGlyphSet()[name].draw(pen)
    return pen.value


def letter_names(font):
    cmap = font.getBestCmap()
    return [cmap[cp] for cp in range(0x0780, 0x07A6)]


def test_weight_offset_mapping():
    assert weight_to_offset(400) == 0
    assert weight_to_offset(100) == -24
    assert weight_to_offset(900) == 18
    assert weight_to_offset(250) < 0 < weight_to_offset(650)


def test_sangu_default_keeps_outlines_and_coverage():
    f, ref = sangu(), ref_sangu()
    cmap = f.getBestCmap()
    assert all(cp in cmap for cp in range(0x0780, 0x07B2))
    for cp in (0xFDF2, 0x060C, 0x061B, 0x061F):
        assert cp in cmap
    for name in letter_names(f):
        assert signed_area(f, name) == pytest.approx(signed_area(ref, name))
        assert f["hmtx"][name][0] == ref["hmtx"][name][0]


def test_sangu_weight_thins_and_thickens_every_letter():
    ref, thin, bold = ref_sangu(), sangu(weight=100), sangu(weight=900)
    for name in letter_names(ref):
        a0, a1, a2 = (abs(signed_area(f, name)) for f in (ref, thin, bold))
        assert 0 < a1 < a0 < a2, name


def test_sangu_keeps_clockwise_truetype_winding():
    ref = ref_sangu()
    for f in (sangu(weight=100), sangu(weight=900)):
        for name in letter_names(f):
            assert (signed_area(f, name) < 0) == (signed_area(ref, name) < 0), name


def test_sangu_bold_keeps_gaps_and_zero_width_marks():
    ref, bold = ref_sangu(), sangu(weight=900)
    d = weight_to_offset(900)
    cmap = ref.getBestCmap()
    base, mark = cmap[0x0784], cmap[0x07A6]
    assert bold["hmtx"][base][0] == ref["hmtx"][base][0] + 2 * d
    assert ref["hmtx"][mark][0] == 0 and bold["hmtx"][mark][0] == 0


def ink_centres(font, text):
    """(glyph name, advance, x centre of its outline) for every shaped glyph, in output order."""
    gs, out = font.getGlyphSet(), []
    for name, x, _ in origins(font, text):
        g = font["glyf"][name]
        out.append((name, font["hmtx"][name][0], x + (g.xMin + g.xMax) / 2))
    return out


@pytest.mark.parametrize("weight", [100, 900])
def test_sangu_marks_stay_attached(weight):
    """A mark must keep the same distance from the letter it sits on, whatever the weight."""
    ref, new = ref_sangu(), sangu(weight=weight)
    a, b = ink_centres(ref, TEXT), ink_centres(new, TEXT)
    assert [n for n, _, _ in a] == [n for n, _, _ in b]
    pairs = 0
    for i in range(len(a) - 1):
        if a[i][1] == 0 and a[i + 1][1] > 0:        # right-to-left output: a mark comes just before its letter
            pairs += 1
            assert (b[i][2] - b[i + 1][2]) == pytest.approx(a[i][2] - a[i + 1][2], abs=6)
    assert pairs >= 2


def test_sangu_licence_credit_and_rename():
    f = sangu(name="Lion Font")
    assert f["name"].getDebugName(1) == "Lion Font"
    assert "Sangu Suruhee" in f["name"].getDebugName(10)
    assert "DSIG" not in f
    data, slug = build_zip(PlayParams(base="sangu", name="Lion Font"))
    import zipfile
    z = zipfile.ZipFile(io.BytesIO(data))
    assert "Thaana Type Foundry" in z.read("OFL.txt").decode()
    assert "Sangu Suruhee" in z.read("README.txt").decode()
    for n in z.namelist():
        if n.endswith(".ttf"):
            TTFont(io.BytesIO(z.read(n)))


def test_unknown_base_falls_back_to_noto():
    assert PlayParams(base="nope").validated().base == "noto"
