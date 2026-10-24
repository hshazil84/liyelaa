"""Handwriting path: turn the person's traced outlines into a working font.

What goes in is the same outline model the browser editor uses: closed contours of points with relative
bezier handles, in font units (1000 per em, y up, baseline at 0). What comes out is a TrueType font with:
  - clean outlines (overlaps merged, clockwise, quadratic curves)
  - vowel marks (fili) attached to every letter through GPOS mark positioning
  - optional ligatures (GSUB liga), kerning pairs (GPOS kern)
  - right-to-left forms (GSUB rtlm for quotation marks; Latin , ; ? typed in Dhivehi show the Arabic forms)
  - letters the person did not draw filled from Noto Sans Thaana (SIL OFL), on request.
"""
from __future__ import annotations

import io
import re
import statistics
import zipfile
from dataclasses import dataclass, field
from datetime import date
from typing import Literal, Optional

import pathops
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from pydantic import BaseModel, Field, field_validator

from .play import ASSETS, font_bytes

NOTO = ASSETS / "NotoSansThaana-Variable.ttf"
NOTO_OFL = ASSETS / "OFL-NotoSansThaana.txt"
INTER = ASSETS / "Inter-Latin-Regular.ttf"          # fills English letters that were not drawn (SIL OFL 1.1, see OFL-Inter.txt)
LATIN_LETTERS = list(range(0x41, 0x5B)) + list(range(0x61, 0x7B))
# digits, keyboard punctuation and common symbols the person did not draw (the same set AK Rasmee covers); Inter fills them
INTER_SYMBOLS = (
    list(range(0x30, 0x3A)) + [0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x2A, 0x2B, 0x2D, 0x2F, 0x3C, 0x3D, 0x3E, 0x40,
                               0x5B, 0x5C, 0x5D, 0x5E, 0x5F, 0x60, 0x7B, 0x7C, 0x7D, 0x7E,
                               0xA5, 0xA8, 0xAF, 0xB1, 0xB4, 0xB7, 0xD7, 0xF7, 0x2DC, 0x201A, 0x201E, 0x2026, 0x20AC, 0x2212]
)
INTER_LATIN_KEYS = [0x2C, 0x3B, 0x3F]                # only when typed , ; ? are not turned into the Arabic marks
LATIN_SCALE = 494 / 727                              # Inter's capitals are 727 tall; the template's top line is 494, so English stands as tall as Thaana

UPEM = 1000
MARK_RANGE = range(0x07A6, 0x07B1)           # the 11 vowel signs (fili) and sukun
MARKS_BELOW = {0x07A8, 0x07A9}               # ibifili and eebeefili sit under the letter; ubufili and ooboofili are above
REF_TOP = 342                                # top of the dotted box on the template, in font units (9 mm)
REF_BOTTOM = 0
FALLBACK_GAP = 40                            # space kept between a starter-font mark and its letter
SPACE_ADVANCE = 280

# code points the starter font is allowed to fill in
FALLBACK_CPS = (
    list(range(0x0780, 0x07B2)) + [0x060C, 0x061B, 0x061F, 0xFDF2, 0xFDFD, 0x2018, 0x2019, 0x201C, 0x201D,
                                   0x0021, 0x0028, 0x0029, 0x002E, 0x003A]
)
# typed with the Latin keys, shown with the Arabic forms (Dhivehi keyboards often produce these)
LATIN_TO_ARABIC = {0x002C: 0x060C, 0x003B: 0x061B, 0x003F: 0x061F}
QUOTE_SWAPS = [(0x201C, 0x201D), (0x2018, 0x2019)]
RUFIYAA = 0x20C2


# ----------------------------------------------------------------------------- request model
class Pt(BaseModel):
    x: float = Field(ge=-6000, le=6000)
    y: float = Field(ge=-6000, le=6000)


class Seg(BaseModel):
    p: Pt
    hi: Pt
    ho: Pt


Contours = list[list[Seg]]


def _check_contours(v: Contours) -> Contours:
    if len(v) > 60 or any(len(c) > 800 for c in v):
        raise ValueError("outline too complex")
    return v


class GlyphIn(BaseModel):
    id: str = Field(max_length=12)
    cp: list[int] = Field(min_length=1, max_length=1)
    contours: Contours
    adv: float = Field(ge=0, le=4000)

    _c = field_validator("contours")(_check_contours)

    @field_validator("cp")
    @classmethod
    def _cp(cls, v: list[int]) -> list[int]:
        if not all(0x20 <= c <= 0x10FFFF and not 0xD800 <= c <= 0xDFFF for c in v):
            raise ValueError("bad code point")
        return v


class LigatureIn(BaseModel):
    id: str = Field(max_length=24)
    sequence: list[int] = Field(min_length=2, max_length=6)
    when: Literal["always", "start", "end"] = "always"      # anywhere, or only at the start or end of a word
    contours: Contours
    adv: float = Field(ge=0, le=6000)

    _c = field_validator("contours")(_check_contours)


class AnchorIn(BaseModel):
    top: Optional[Pt] = None
    bottom: Optional[Pt] = None


class KernIn(BaseModel):
    left: str = Field(max_length=12)         # glyph ids, in the order the text is typed
    right: str = Field(max_length=12)
    value: int = Field(ge=-500, le=500)


class MarkOffsetIn(BaseModel):
    """A hand adjustment for one vowel mark on one letter, in font units (x right, y up), on top of the automatic anchor."""
    base: str = Field(max_length=12)         # glyph id of the letter
    mark: str = Field(max_length=12)         # glyph id of the vowel mark
    dx: int = Field(0, ge=-400, le=400)
    dy: int = Field(0, ge=-400, le=400)


def _one_line(v: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f]", " ", v)).strip()


class BuildRequest(BaseModel):
    name: str = Field("My Handwriting", max_length=60)
    author: str = Field("", max_length=80)               # the designer; also the copyright holder
    website: str = Field("", max_length=120)
    description: str = Field("", max_length=200)
    version: str = "1.000"
    glyphs: list[GlyphIn] = Field(max_length=200)
    ligatures: list[LigatureIn] = Field(default_factory=list, max_length=60)
    anchors: dict[str, AnchorIn] = Field(default_factory=dict)
    kerning: list[KernIn] = Field(default_factory=list, max_length=2000)
    mark_offsets: list[MarkOffsetIn] = Field(default_factory=list, max_length=700)
    fallback: Literal["noto", "none"] = "noto"
    licence: Literal["ofl", "private"] = "ofl"
    rufiyaa_private_use: bool = False                    # also place the rufiyaa sign (U+20C2) at U+E000, so it works before software knows U+20C2
    latin_punctuation: bool = True                        # typed , ; ? show the Arabic forms ، ؛ ؟
    rtl_quotes: bool = True                               # swap the quote shapes in right-to-left text
    spacing: int = Field(0, ge=-100, le=200)
    space_width: int = Field(SPACE_ADVANCE, ge=100, le=800)

    @field_validator("author", "description", mode="before")
    @classmethod
    def _text(cls, v):
        return _one_line(v) if isinstance(v, str) else v

    @field_validator("website", mode="before")
    @classmethod
    def _site(cls, v):
        if not isinstance(v, str):
            return v
        v = v.strip()
        if not v:
            return ""
        if re.search(r"\s", v):
            raise ValueError("The website cannot have spaces in it")
        if "://" in v:
            if not re.match(r"^https?://", v, re.I):
                raise ValueError("The website must start with http:// or https://")
        else:
            v = "https://" + v
        if "." not in v.split("://", 1)[1]:
            raise ValueError("That does not look like a website address")
        return v

    @field_validator("version", mode="before")
    @classmethod
    def _version(cls, v):
        m = re.fullmatch(r"(\d{1,3})(?:\.(\d{1,3}))?", str(v).strip() or "1.000")
        if not m:
            raise ValueError("Version looks like 1.000 or 2.1")
        return f"{int(m.group(1))}.{(m.group(2) or '0').ljust(3, '0')}"


@dataclass
class Item:
    name: str
    cps: list[int]
    adv: int
    glyph: object                              # fontTools Glyph
    bounds: Optional[tuple[float, float, float, float]]
    is_mark: bool = False
    from_fallback: bool = False
    anchor_top: Optional[tuple[int, int]] = None      # on a letter: where a mark above attaches
    anchor_bottom: Optional[tuple[int, int]] = None
    mark_anchor: Optional[tuple[int, int]] = None     # on a mark: the point that lands on the letter's anchor


def gname(cp: int) -> str:
    return "space" if cp == 0x20 else f"uni{cp:04X}"


def clean_name(raw: str, default: str) -> str:
    return re.sub(r"[^A-Za-z0-9 \-]", "", raw).strip()[:40] or default


# ----------------------------------------------------------------------------- outlines
def _to_path(contours: Contours) -> pathops.Path:
    path = pathops.Path()
    pen = path.getPen()
    for ct in contours:
        if len(ct) < 2:
            continue
        pen.moveTo((ct[0].p.x, ct[0].p.y))
        for i in range(1, len(ct) + 1):
            a, b = ct[i - 1], ct[i % len(ct)]
            straight = not (a.ho.x or a.ho.y or b.hi.x or b.hi.y)
            end = (b.p.x, b.p.y)
            if straight:
                if i < len(ct):
                    pen.lineTo(end)
            else:
                pen.curveTo((a.p.x + a.ho.x, a.p.y + a.ho.y), (b.p.x + b.hi.x, b.p.y + b.hi.y), end)
        pen.closePath()
    return path


def outline_to_glyph(contours: Contours):
    """Merge overlaps, make outer shapes clockwise, turn cubic curves into quadratic ones."""
    path = _to_path(contours)
    tt = TTGlyphPen(None)
    if len(list(path.segments)):
        path.simplify(fix_winding=True, keep_starting_points=False, clockwise=True)
        path.draw(Cu2QuPen(tt, max_err=1.0, reverse_direction=False))
    glyph = tt.glyph()
    glyph.recalcBounds(None)
    # the ink box of the curves themselves; the glyph's own box counts off-curve points and overshoots by a few units
    bounds = tuple(float(v) for v in path.bounds) if glyph.numberOfContours else None
    return glyph, bounds


def _item(name: str, cps: list[int], contours: Contours, adv: float, is_mark: bool) -> Item:
    glyph, bounds = outline_to_glyph(contours)
    return Item(name, cps, 0 if is_mark else int(round(adv)), glyph, bounds, is_mark)


# ----------------------------------------------------------------------------- starter font
def _starter_items(wanted: list[int], user: dict[int, Item]) -> list[Item]:
    if not wanted:
        return []
    var = TTFont(NOTO)
    font = instancer.instantiateVariableFont(var, {"wght": 500}, inplace=False)
    cmap, gs, hmtx = font.getBestCmap(), font.getGlyphSet(), font["hmtx"]

    def raw(cp, s=1.0, dx=0.0):
        rec = DecomposingRecordingPen(gs)          # flatten composite glyphs into plain outlines
        gs[cmap[cp]].draw(rec)
        pen = TTGlyphPen(None)
        rec.replay(TransformPen(pen, (s, 0, 0, s, dx, 0)))
        g = pen.glyph()
        g.recalcBounds(None)
        return g, ((g.xMin, g.yMin, g.xMax, g.yMax) if g.numberOfContours else None)

    # match the size of the person's handwriting: median height ratio over letters that exist in both
    ratios = []
    for cp, it in user.items():
        if 0x0780 <= cp <= 0x07A5 and it.bounds and cp in cmap:
            _, nb = raw(cp)
            if nb and nb[3] > nb[1]:
                ratios.append((it.bounds[3] - it.bounds[1]) / (nb[3] - nb[1]))
    scale = min(1.5, max(0.5, statistics.median(ratios))) if len(ratios) >= 3 else 1.0

    out = []
    for cp in wanted:
        if cp not in cmap:
            continue
        is_mark = cp in MARK_RANGE
        glyph, b = raw(cp, scale)
        adv = 0
        if is_mark:
            if b:
                dx = -(b[0] + b[2]) / 2                      # centre the mark on its origin
                glyph, b = raw(cp, scale, dx)
        else:
            adv = int(round(hmtx[cmap[cp]][0] * scale))
        it = Item(gname(cp), [cp], adv, glyph, b, is_mark, from_fallback=True)
        if is_mark and b:
            if cp in MARKS_BELOW:
                it.mark_anchor = (0, int(b[3] + FALLBACK_GAP))
            else:
                it.mark_anchor = (0, int(b[1] - FALLBACK_GAP))
        out.append(it)
    return out


def _inter_items(wanted: list[int]) -> list[Item]:
    """English letters from Inter, shrunk to sit with the Thaana letters."""
    if not wanted:
        return []
    font = TTFont(INTER)
    cmap, gs, hmtx = font.getBestCmap(), font.getGlyphSet(), font["hmtx"]
    k = UPEM / font["head"].unitsPerEm * LATIN_SCALE
    out = []
    for cp in wanted:
        if cp not in cmap:
            continue
        rec = DecomposingRecordingPen(gs)
        gs[cmap[cp]].draw(rec)
        pen = TTGlyphPen(None)
        rec.replay(TransformPen(pen, (k, 0, 0, k, 0, 0)))
        g = pen.glyph()
        g.recalcBounds(None)
        b = (g.xMin, g.yMin, g.xMax, g.yMax) if g.numberOfContours else None
        out.append(Item(gname(cp), [cp], int(round(hmtx[cmap[cp]][0] * k)), g, b, False, from_fallback=True))
    return out


# ----------------------------------------------------------------------------- assembling
def _notdef() -> Item:
    pen = TTGlyphPen(None)
    pen.moveTo((60, 0)); pen.lineTo((60, 700)); pen.lineTo((440, 700)); pen.lineTo((440, 0)); pen.closePath()
    pen.moveTo((110, 50)); pen.lineTo((390, 50)); pen.lineTo((390, 650)); pen.lineTo((110, 650)); pen.closePath()
    g = pen.glyph()
    g.recalcBounds(None)
    return Item(".notdef", [], 500, g, (g.xMin, g.yMin, g.xMax, g.yMax))


def _empty(name: str, cps: list[int], adv: int) -> Item:
    g = TTGlyphPen(None).glyph()
    return Item(name, cps, adv, g, None)


def build_handwriting_font(req: BuildRequest) -> tuple[TTFont, dict]:
    if req.fallback == "noto" and req.licence == "private":
        raise ValueError("The starter font is open source, so a font that uses it has to stay open source too.")
    name = clean_name(req.name, "My Handwriting")

    # 1. the person's own glyphs
    user: dict[int, Item] = {}
    for g in req.glyphs:
        cp = g.cp[0]
        if g.contours:
            user[cp] = _item(gname(cp), [cp], g.contours, g.adv, cp in MARK_RANGE)
    ids_by_cp = {g.cp[0]: g.id for g in req.glyphs}
    cp_by_id = {g.id: g.cp[0] for g in req.glyphs}
    offsets: dict[tuple[int, int], tuple[int, int]] = {}
    for o in req.mark_offsets:
        if o.base in cp_by_id and o.mark in cp_by_id and cp_by_id[o.mark] in MARK_RANGE:
            offsets[(cp_by_id[o.base], cp_by_id[o.mark])] = (o.dx, o.dy)

    # 2. fill gaps from the starter font
    filled: list[int] = []
    items: dict[int, Item] = dict(user)
    if req.fallback == "noto":
        missing = [cp for cp in FALLBACK_CPS if cp not in user]
        for it in _starter_items(missing, user):
            items[it.cps[0]] = it
            filled.append(it.cps[0])

    inter_filled: list[int] = []
    if req.fallback == "noto":
        wanted = LATIN_LETTERS + INTER_SYMBOLS + ([] if req.latin_punctuation else INTER_LATIN_KEYS)
        for it in _inter_items([cp for cp in wanted if cp not in user]):
            items[it.cps[0]] = it
            inter_filled.append(it.cps[0])

    # 3. ligatures drawn by the person
    ligs: list[tuple[LigatureIn, Item]] = []
    for lg in req.ligatures:
        if not lg.contours or not all(c in items for c in lg.sequence):
            continue
        slug = re.sub(r"[^A-Za-z0-9]", "", lg.id)[:20] or f"{len(ligs)}"
        it = _item(f"lig_{slug}", [], lg.contours, lg.adv, False)
        ligs.append((lg, it))

    # 4. anchors: where marks attach on each letter
    for cp, it in items.items():
        if it.is_mark or not it.bounds:
            continue
        x0, y0, x1, y1 = it.bounds
        cx = int(round((x0 + x1) / 2))
        it.anchor_top, it.anchor_bottom = (cx, int(y1)), (cx, int(y0))
        a = req.anchors.get(ids_by_cp.get(cp, f"{cp:04X}"))
        if a and a.top:
            it.anchor_top = (int(round(a.top.x)), int(round(a.top.y)))
        if a and a.bottom:
            it.anchor_bottom = (int(round(a.bottom.x)), int(round(a.bottom.y)))
    for cp, it in items.items():
        if it.is_mark and it.mark_anchor is None:
            it.mark_anchor = (0, REF_BOTTOM if cp in MARKS_BELOW else REF_TOP)     # drawn against the template box

    # 5. glyph order, cmap, metrics
    order_items: list[Item] = [_notdef(), _empty("space", [0x20, 0xA0], req.space_width)]
    for cp in sorted(items):
        order_items.append(items[cp])
    order_items += [it for _, it in ligs]
    cmap: dict[int, str] = {0x20: "space", 0xA0: "space"}
    for cp, it in items.items():
        cmap[cp] = it.name
    if req.latin_punctuation:
        for latin, arabic in LATIN_TO_ARABIC.items():
            if arabic in items:
                cmap[latin] = items[arabic].name
    if req.rufiyaa_private_use and RUFIYAA in items and not items[RUFIYAA].from_fallback:
        cmap[0xE000] = items[RUFIYAA].name

    ys = [b for it in order_items if it.bounds for b in (it.bounds[1], it.bounds[3])]
    ascent = int(max(800, max(ys, default=0) + 60))
    descent = int(min(-300, min(ys, default=0) - 60))

    fb = FontBuilder(UPEM, isTTF=True)
    fb.setupGlyphOrder([it.name for it in order_items])
    fb.setupCharacterMap(cmap)
    fb.setupGlyf({it.name: it.glyph for it in order_items})
    glyf = fb.font["glyf"]
    metrics = {}
    for it in order_items:
        g = glyf[it.name]
        g.recalcBounds(glyf)
        adv = it.adv
        if not it.is_mark and it.name not in (".notdef", "space"):
            adv = max(0, adv + req.spacing)
        metrics[it.name] = (adv, g.xMin if g.numberOfContours else 0)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ascent, descent=descent)

    author = req.author.strip() or "the author"
    year = date.today().year
    ps = re.sub(r"[^A-Za-z0-9]", "", name) or "MyHandwriting"
    lic = (f"Copyright (c) {year} {author}. This Font Software is licensed under the SIL Open Font License, Version 1.1."
           if req.licence == "ofl" else f"Copyright (c) {year} {author}. All rights reserved.")
    desc = req.description.strip() or "Made with ThaanaFont from handwriting."
    if filled:
        desc += " Letters that were not drawn come from Noto Sans Thaana (SIL OFL 1.1)."
    if inter_filled:
        desc += " English letters, digits and symbols that were not drawn come from Inter (SIL OFL 1.1)."
    names = {
        "familyName": name, "styleName": "Regular", "uniqueFontIdentifier": f"{ps}-{req.version}-Regular;thaanafont",
        "fullName": f"{name} Regular", "psName": f"{ps}-Regular", "version": f"Version {req.version}",
        "copyright": lic.split(". ")[0], "licenseDescription": lic, "description": desc,
    }
    if req.licence == "ofl":
        names["licenseInfoURL"] = "https://openfontlicense.org"
    if req.author.strip():
        names["designer"] = req.author.strip()
    if req.website:
        names["designerURL"] = req.website
    fb.setupNameTable(names)
    fb.setupOS2(sTypoAscender=ascent, sTypoDescender=descent, sTypoLineGap=0, usWinAscent=ascent, usWinDescent=-descent,
                usWeightClass=400, fsType=0, achVendID="DFMK")
    fb.setupPost()
    font = fb.font
    font["head"].fontRevision = float(req.version)

    # 6. OpenType features
    glyph_of = {cp: it.name for cp, it in items.items()}
    items_by_name = {it.name: cp for cp, it in items.items()}
    bases = [it.name for it in order_items if it.name not in (".notdef",) and not it.is_mark and not it.name.startswith("lig_")]
    marks = [it.name for it in order_items if it.is_mark]
    lig_names = [it.name for _, it in ligs]
    fea = ["languagesystem DFLT dflt;", "languagesystem thaa dflt;", "languagesystem latn dflt;"]
    if marks:
        mark_cps = [cp for cp in sorted(items) if items[cp].is_mark]
        for cp in mark_cps:
            it = items[cp]
            fea.append(f"markClass {it.name} <anchor {it.mark_anchor[0]} {it.mark_anchor[1]}> @MC_{it.name};")
        lines = []
        for cp in sorted(items):
            it = items[cp]
            if it.is_mark or not it.bounds or cp in LATIN_LETTERS:          # Thaana marks do not sit on English letters
                continue
            for mcp in mark_cps:
                anchor = it.anchor_bottom if mcp in MARKS_BELOW else it.anchor_top
                if not anchor:
                    continue
                dx, dy = offsets.get((cp, mcp), (0, 0))
                lines.append(f"    pos base {it.name} <anchor {anchor[0] + dx} {anchor[1] + dy}> mark @MC_{items[mcp].name};")
        if lines:
            fea += ["feature mark {"] + lines + ["} mark;"]
    if ligs:
        everywhere = [(lg, it) for lg, it in ligs if lg.when == "always"]
        contextual = [(lg, it) for lg, it in ligs if lg.when != "always"]
        if everywhere:
            fea += ["feature liga {"]
            for lg, it in sorted(everywhere, key=lambda t: -len(t[0].sequence)):         # longest sequences first
                fea.append(f"    sub {' '.join(glyph_of[c] for c in lg.sequence)} by {it.name};")
            fea += ["} liga;"]
        if contextual:
            # a letter or mark of Thaana text: "start of a word" means no such glyph just before, "end" means none just after
            word = [it.name for it in order_items if it.name not in (".notdef", "space") and not it.name.startswith("lig_")
                    and (items_by_name[it.name] >= 0x0780 and items_by_name[it.name] <= 0x07B0)]
            fea.append("@WORD = [" + " ".join(word) + "];")
            for lg, it in contextual:
                seq = [glyph_of[c] for c in lg.sequence]
                fea.append(f"lookup LIG_{it.name} {{ sub {' '.join(seq)} by {it.name}; }} LIG_{it.name};")
            fea += ["feature calt {"]
            for lg, it in sorted(contextual, key=lambda t: -len(t[0].sequence)):
                seq = [glyph_of[c] for c in lg.sequence]
                marked = " ".join(f"{g}'" for g in seq)
                if lg.when == "start":
                    fea.append(f"    ignore sub @WORD {marked};")
                else:
                    fea.append(f"    ignore sub {marked} @WORD;")
                look = " ".join(f"{g}'" + (f" lookup LIG_{it.name}" if i == 0 else "") for i, g in enumerate(seq))
                fea.append(f"    sub {look};")
            fea += ["} calt;"]
    swaps = [(glyph_of[a], glyph_of[b]) for a, b in QUOTE_SWAPS if req.rtl_quotes and a in glyph_of and b in glyph_of]
    if swaps:
        fea += ["feature rtlm {"]
        for a, b in swaps:
            fea += [f"    sub {a} by {b};", f"    sub {b} by {a};"]
        fea += ["} rtlm;"]
    by_id = {g.id: g.cp[0] for g in req.glyphs}
    pairs = [(glyph_of[by_id[k.left]], glyph_of[by_id[k.right]], k.value) for k in req.kerning
             if k.left in by_id and k.right in by_id and by_id[k.left] in glyph_of and by_id[k.right] in glyph_of and k.value]
    if pairs:
        # Right-to-left: the first letter of a pair is the right-hand one. Moving it right by v and widening it by v
        # opens (or closes) the gap between the two letters and leaves every other gap alone.
        # Vowel marks sit between two letters in the text, so a pair has to see through them.
        fea += ["feature kern {", "    lookupflag IgnoreMarks;"] + [f"    pos {a} <{v} 0 {v} 0> {b} <0 0 0 0>;" for a, b, v in pairs] + ["} kern;"]
    classes = f"[{' '.join(bases)}]", f"[{' '.join(lig_names)}]" if lig_names else "[]", f"[{' '.join(marks)}]" if marks else "[]"
    fea += ["table GDEF {", f"    GlyphClassDef {classes[0]}, {classes[1]}, {classes[2]}, ;", "} GDEF;"]
    addOpenTypeFeaturesFromString(font, "\n".join(fea))

    report = {
        "glyphs": len(order_items),
        "drawn": sorted(f"{cp:04X}" for cp in user),
        "filled_from_starter": sorted(f"{cp:04X}" for cp in filled),
        "filled_from_inter": sorted(f"{cp:04X}" for cp in inter_filled),
        "ligatures": len(ligs),
        "kern_pairs": len(pairs),
    }
    return font, report


# ----------------------------------------------------------------------------- download
def _ofl_text(req: BuildRequest, filled: bool, inter: bool = False) -> str:
    year = date.today().year
    author = req.author.strip() or "the author"
    ofl = NOTO_OFL.read_text().split("\n", 1)[1]            # the licence text without its Noto copyright line
    head = f"Copyright (c) {year} {author}\n" + (f"{req.website}\n" if req.website else "")
    if filled:
        head += "Includes outlines from Noto Sans Thaana. Copyright 2022 The Noto Project Authors (https://github.com/notofonts/thaana)\n"
    if inter:
        head += "Includes outlines from Inter. Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)\n"
    return head + ofl


def build_zip(req: BuildRequest) -> tuple[bytes, str, dict]:
    font, report = build_handwriting_font(req)
    name = clean_name(req.name, "My Handwriting")
    slug = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-") or "font"
    buf = io.BytesIO()
    filled = bool(report["filled_from_starter"])
    inter = bool(report["filled_from_inter"])
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{slug}.ttf", font_bytes(font, None))
        z.writestr(f"{slug}.woff2", font_bytes(font, "woff2"))
        if req.licence == "ofl":
            z.writestr("OFL.txt", _ofl_text(req, filled, inter))
        z.writestr(
            "README.txt",
            f"{name} {req.version}\n\n"
            + (f"{req.description.strip()}\n\n" if req.description.strip() else "")
            + (f"Designed by {req.author.strip()}\n" if req.author.strip() else "")
            + (f"{req.website}\n" if req.website else "")
            + ("\n" if req.author.strip() or req.website else "")
            + "A font made from handwriting with ThaanaFont.\n"
            "Install the .ttf on your computer, or use the .woff2 on a website.\n"
            "Typing the Latin keys , ; ? gives the Arabic comma, semicolon and question mark.\n"
            + ("Letters that were not drawn come from Noto Sans Thaana (SIL Open Font License 1.1).\n" if filled else "")
            + ("English letters that were not drawn come from Inter (SIL Open Font License 1.1).\n" if inter else "")
            + ("See OFL.txt for the licence.\n" if req.licence == "ofl" else "All rights reserved by the author.\n"),
        )
    return buf.getvalue(), slug, report
