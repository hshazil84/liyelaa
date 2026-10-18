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

UPEM = 1000
MARK_RANGE = range(0x07A6, 0x07B1)           # the 11 vowel signs (fili) and sukun
MARKS_BELOW = {0x07AA, 0x07AB}               # ubufili and ooboofili sit under the letter
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


class BuildRequest(BaseModel):
    name: str = Field("My Handwriting", max_length=60)
    author: str = Field("", max_length=80)
    glyphs: list[GlyphIn] = Field(max_length=200)
    ligatures: list[LigatureIn] = Field(default_factory=list, max_length=60)
    anchors: dict[str, AnchorIn] = Field(default_factory=dict)
    kerning: list[KernIn] = Field(default_factory=list, max_length=2000)
    fallback: Literal["noto", "none"] = "noto"
    licence: Literal["ofl", "private"] = "ofl"
    spacing: int = Field(0, ge=-100, le=200)
    space_width: int = Field(SPACE_ADVANCE, ge=100, le=800)


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
    bounds = (glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax) if glyph.numberOfContours else None
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

    # 2. fill gaps from the starter font
    filled: list[int] = []
    items: dict[int, Item] = dict(user)
    if req.fallback == "noto":
        missing = [cp for cp in FALLBACK_CPS if cp not in user]
        for it in _starter_items(missing, user):
            items[it.cps[0]] = it
            filled.append(it.cps[0])

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
    for latin, arabic in LATIN_TO_ARABIC.items():
        if arabic in items:
            cmap[latin] = items[arabic].name

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
    names = {
        "familyName": name, "styleName": "Regular", "uniqueFontIdentifier": f"{ps}-Regular;dhivehi-font-maker",
        "fullName": f"{name} Regular", "psName": f"{ps}-Regular", "version": "Version 1.000", "copyright": lic.split(". ")[0],
        "licenseDescription": lic, "description": "Made with Dhivehi Font Maker from handwriting.",
    }
    if req.licence == "ofl":
        names["licenseInfoURL"] = "https://openfontlicense.org"
    if filled:
        names["description"] += " Letters that were not drawn come from Noto Sans Thaana (SIL OFL 1.1)."
    if req.author.strip():
        names["designer"] = req.author.strip()
    fb.setupNameTable(names)
    fb.setupOS2(sTypoAscender=ascent, sTypoDescender=descent, sTypoLineGap=0, usWinAscent=ascent, usWinDescent=-descent,
                usWeightClass=400, fsType=0, achVendID="DFMK")
    fb.setupPost()
    font = fb.font

    # 6. OpenType features
    glyph_of = {cp: it.name for cp, it in items.items()}
    bases = [it.name for it in order_items if it.name not in (".notdef",) and not it.is_mark and not it.name.startswith("lig_")]
    marks = [it.name for it in order_items if it.is_mark]
    lig_names = [it.name for _, it in ligs]
    fea = ["languagesystem DFLT dflt;", "languagesystem thaa dflt;"]
    if marks:
        top = [(items[cp], cp) for cp in sorted(items) if items[cp].is_mark and cp not in MARKS_BELOW]
        bot = [(items[cp], cp) for cp in sorted(items) if items[cp].is_mark and cp in MARKS_BELOW]
        for it, _ in top:
            fea.append(f"markClass {it.name} <anchor {it.mark_anchor[0]} {it.mark_anchor[1]}> @MC_top;")
        for it, _ in bot:
            fea.append(f"markClass {it.name} <anchor {it.mark_anchor[0]} {it.mark_anchor[1]}> @MC_bottom;")
        lines = []
        for cp in sorted(items):
            it = items[cp]
            if it.is_mark or not it.bounds:
                continue
            if top and it.anchor_top:
                lines.append(f"    pos base {it.name} <anchor {it.anchor_top[0]} {it.anchor_top[1]}> mark @MC_top;")
            if bot and it.anchor_bottom:
                lines.append(f"    pos base {it.name} <anchor {it.anchor_bottom[0]} {it.anchor_bottom[1]}> mark @MC_bottom;")
        if lines:
            fea += ["feature mark {"] + lines + ["} mark;"]
    if ligs:
        fea += ["feature liga {"]
        for lg, it in sorted(ligs, key=lambda t: -len(t[0].sequence)):         # longest sequences first
            fea.append(f"    sub {' '.join(glyph_of[c] for c in lg.sequence)} by {it.name};")
        fea += ["} liga;"]
    swaps = [(glyph_of[a], glyph_of[b]) for a, b in QUOTE_SWAPS if a in glyph_of and b in glyph_of]
    if swaps:
        fea += ["feature rtlm {"]
        for a, b in swaps:
            fea += [f"    sub {a} by {b};", f"    sub {b} by {a};"]
        fea += ["} rtlm;"]
    by_id = {g.id: g.cp[0] for g in req.glyphs}
    pairs = [(glyph_of[by_id[k.left]], glyph_of[by_id[k.right]], k.value) for k in req.kerning
             if k.left in by_id and k.right in by_id and by_id[k.left] in glyph_of and by_id[k.right] in glyph_of and k.value]
    if pairs:
        fea += ["feature kern {"] + [f"    pos {a} {b} {v};" for a, b, v in pairs] + ["} kern;"]
    classes = f"[{' '.join(bases)}]", f"[{' '.join(lig_names)}]" if lig_names else "[]", f"[{' '.join(marks)}]" if marks else "[]"
    fea += ["table GDEF {", f"    GlyphClassDef {classes[0]}, {classes[1]}, {classes[2]}, ;", "} GDEF;"]
    addOpenTypeFeaturesFromString(font, "\n".join(fea))

    report = {
        "glyphs": len(order_items),
        "drawn": sorted(f"{cp:04X}" for cp in user),
        "filled_from_starter": sorted(f"{cp:04X}" for cp in filled),
        "ligatures": len(ligs),
        "kern_pairs": len(pairs),
    }
    return font, report


# ----------------------------------------------------------------------------- download
def _ofl_text(req: BuildRequest, filled: bool) -> str:
    year = date.today().year
    author = req.author.strip() or "the author"
    ofl = NOTO_OFL.read_text().split("\n", 1)[1]            # the licence text without its Noto copyright line
    head = f"Copyright (c) {year} {author}\n"
    if filled:
        head += "Includes outlines from Noto Sans Thaana. Copyright 2022 The Noto Project Authors (https://github.com/notofonts/thaana)\n"
    return head + ofl


def build_zip(req: BuildRequest) -> tuple[bytes, str, dict]:
    font, report = build_handwriting_font(req)
    name = clean_name(req.name, "My Handwriting")
    slug = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-") or "font"
    buf = io.BytesIO()
    filled = bool(report["filled_from_starter"])
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{slug}.ttf", font_bytes(font, None))
        z.writestr(f"{slug}.woff2", font_bytes(font, "woff2"))
        if req.licence == "ofl":
            z.writestr("OFL.txt", _ofl_text(req, filled))
        z.writestr(
            "README.txt",
            f"{name}\n\nA font made from handwriting with Dhivehi Font Maker.\n"
            "Install the .ttf on your computer, or use the .woff2 on a website.\n"
            "Typing the Latin keys , ; ? gives the Arabic comma, semicolon and question mark.\n"
            + ("Letters that were not drawn come from Noto Sans Thaana (SIL Open Font License 1.1).\n" if filled else "")
            + ("See OFL.txt for the licence.\n" if req.licence == "ofl" else "All rights reserved by the author.\n"),
        )
    return buf.getvalue(), slug, report
