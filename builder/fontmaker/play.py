"""Play path: take the bundled open Thaana font and restyle it (weight, width, slant, spacing)."""
from __future__ import annotations

import io
import math
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables import otTables
from fontTools.ttLib.tables.otBase import BaseTable, ValueRecord
from fontTools.varLib import instancer

ASSETS = Path(__file__).resolve().parent.parent / "assets"


@dataclass(frozen=True)
class Base:
    """An open font that Play can restyle. A variable base uses its weight axis; a static one is thickened or thinned."""
    id: str
    label: str
    file: Path
    licence: Path
    credit: str            # "Noto Sans Thaana", used in the font's description and README
    variable: bool


BASES: dict[str, Base] = {
    "noto": Base("noto", "Noto Sans Thaana", ASSETS / "NotoSansThaana-Variable.ttf", ASSETS / "OFL-NotoSansThaana.txt",
                 "Noto Sans Thaana", True),
    "sangu": Base("sangu", "Sangu Suruhee", ASSETS / "SanguSuruhee.ttf", ASSETS / "OFL-SanguSuruhee.txt",
                  "Sangu Suruhee by Thaana Type Foundry", False),
}
DEFAULT_BASE = "noto"

# Static bases have one weight (400). Slider weights map to an outline offset in font units
# (per side): 100 -> -24 (lighter), 400 -> 0 (as drawn), 900 -> +18 (heavier).
OFFSET_LIGHT, OFFSET_HEAVY = 24, 18


def weight_to_offset(weight: int) -> int:
    if weight < 400:
        return -round((400 - weight) / 300 * OFFSET_LIGHT)
    return round((weight - 400) / 500 * OFFSET_HEAVY)


@dataclass(frozen=True)
class PlayParams:
    weight: int = 400          # 100..900
    width: int = 100           # percent, 70..140
    slant: float = 0.0         # degrees, -15..15 (positive leans right)
    spacing: int = 0           # font units added to every advance, -100..200
    name: str = "My Dhivehi Font"
    base: str = DEFAULT_BASE

    def validated(self) -> "PlayParams":
        name = re.sub(r"[^A-Za-z0-9 \-]", "", self.name).strip()[:40] or "My Dhivehi Font"
        return PlayParams(
            weight=int(min(900, max(100, self.weight))),
            width=int(min(140, max(70, self.width))),
            slant=float(min(15.0, max(-15.0, self.slant))),
            spacing=int(min(200, max(-100, self.spacing))),
            name=name,
            base=self.base if self.base in BASES else DEFAULT_BASE,
        )


# ----------------------------------------------------------------------------- GPOS helpers
def _walk_gpos(obj, sx: float, t: float, seen: set[int]) -> None:
    """Apply x' = sx*x + t*y to every anchor and value record inside a GPOS subtable tree."""
    if id(obj) in seen:
        return
    seen.add(id(obj))
    if isinstance(obj, otTables.Anchor):
        x, y = obj.XCoordinate, obj.YCoordinate
        obj.XCoordinate = round(sx * x + t * y)
        return
    if isinstance(obj, ValueRecord):
        xp, yp = getattr(obj, "XPlacement", None), getattr(obj, "YPlacement", None)
        if xp is not None or yp is not None:
            obj.XPlacement = round(sx * (xp or 0) + t * (yp or 0))
        xa = getattr(obj, "XAdvance", None)
        if xa is not None:
            obj.XAdvance = round(sx * xa)
        return
    if isinstance(obj, (list, tuple)):
        for item in obj:
            _walk_gpos(item, sx, t, seen)
    elif isinstance(obj, BaseTable):
        for value in vars(obj).values():
            if isinstance(value, (BaseTable, ValueRecord, list, tuple)):
                _walk_gpos(value, sx, t, seen)


def offset_outlines(font: TTFont, d: int) -> None:
    """Thicken (d > 0) or thin (d < 0) every glyph by d font units per side, keeping side gaps for thickening."""
    import pathops

    gs = font.getGlyphSet()
    glyf, hmtx, order = font["glyf"], font["hmtx"], font.getGlyphOrder()
    new_glyphs = {}
    for name in order:
        path = pathops.Path()
        gs[name].draw(path.getPen(glyphSet=gs))
        pen = TTGlyphPen(None)
        if len(list(path.segments)):
            path.simplify(fix_winding=True, keep_starting_points=False)
            band = pathops.Path(path)
            band.stroke(2 * abs(d), pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4)
            band.convertConicsToQuads(0.5)
            op = pathops.PathOp.UNION if d > 0 else pathops.PathOp.DIFFERENCE
            result = pathops.op(path, band, op, fix_winding=True)
            result.simplify(fix_winding=True, keep_starting_points=False, clockwise=True)   # TrueType outer contours run clockwise
            result.convertConicsToQuads(0.5)
            result.draw(pen)
        new_glyphs[name] = pen.glyph()
    for name, glyph in new_glyphs.items():
        glyf[name] = glyph
    for name in order:
        adv, _ = hmtx[name]
        g = glyf[name]
        g.recalcBounds(glyf)
        if g.numberOfContours and d > 0 and adv > 0:
            # glyph grew d on each side: move it right by d and widen the advance by 2d so gaps stay the same
            g.coordinates.translate((d, 0))
            g.recalcBounds(glyf)
            adv += 2 * d
        hmtx[name] = (adv, getattr(g, "xMin", 0) if g.numberOfContours else 0)
    if "GPOS" in font and d > 0:
        _walk_gpos_shift(font, d)
    for tag in ("cvt ", "fpgm", "prep", "hdmx", "LTSH", "VDMX"):   # hinting no longer matches the outlines
        if tag in font:
            del font[tag]


def _walk_gpos_shift(font: TTFont, dx: int) -> None:
    """Base letters moved right by dx, so the anchors they carry move with them. Marks (zero advance) are not moved."""
    seen: set[int] = set()

    def walk(obj, on_base: bool) -> None:
        if id(obj) in seen:
            return
        seen.add(id(obj))
        if isinstance(obj, otTables.Anchor):
            if on_base:
                obj.XCoordinate += dx
        elif isinstance(obj, (list, tuple)):
            for item in obj:
                walk(item, on_base)
        elif isinstance(obj, BaseTable):
            for key, value in vars(obj).items():
                if isinstance(value, (BaseTable, list, tuple)):
                    walk(value, on_base or key in ("BaseArray", "LigatureArray"))

    for lookup in font["GPOS"].table.LookupList.Lookup:
        for sub in lookup.SubTable:
            walk(sub.ExtSubTable if lookup.LookupType == 9 else sub, False)


def transform_font(font: TTFont, sx: float, slant_deg: float, spacing: int) -> None:
    """Scale horizontally, skew, and add spacing - for outlines, metrics and mark positioning together."""
    t = math.tan(math.radians(slant_deg))        # x' = sx*x + t*y   (y is unchanged)
    glyph_set = font.getGlyphSet()
    glyf, hmtx, order = font["glyf"], font["hmtx"], font.getGlyphOrder()
    new_glyphs = {}
    for name in order:
        pen = TTGlyphPen(glyph_set)
        glyph_set[name].draw(TransformPen(pen, (sx, 0, t, 1, 0, 0)))   # (xx, xy, yx, yy, dx, dy)
        new_glyphs[name] = pen.glyph()
    for name, glyph in new_glyphs.items():
        glyf[name] = glyph
    for name in order:
        adv, _ = hmtx[name]
        g = glyf[name]
        g.recalcBounds(glyf)
        new_adv = round(adv * sx) + (spacing if adv > 0 else 0)
        new_adv = max(new_adv, 0)
        hmtx[name] = (new_adv, getattr(g, "xMin", 0) if g.numberOfContours else 0)
    for tag in ("vhea", "vmtx", "VVAR"):
        if tag in font:
            del font[tag]
    if "GPOS" in font:
        seen: set[int] = set()
        for lookup in font["GPOS"].table.LookupList.Lookup:
            for sub in lookup.SubTable:
                target = sub.ExtSubTable if lookup.LookupType == 9 else sub
                _walk_gpos(target, sx, t, seen)
    font["post"].italicAngle = -slant_deg if abs(slant_deg) > 0.01 else 0


def _rename(font: TTFont, family: str, params: PlayParams) -> None:
    ps = re.sub(r"[^A-Za-z0-9]", "", family) or "MyDhivehiFont"
    names = font["name"]
    for nid in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
        names.removeNames(nameID=nid)
    bold = params.weight >= 700
    style = ("Bold " if bold else "") + ("Italic" if params.slant > 0.01 else "")
    style = style.strip() or "Regular"
    for plat, enc, lang in ((3, 1, 0x409), (1, 0, 0)):
        names.setName(family, 1, plat, enc, lang)
        names.setName(style, 2, plat, enc, lang)
        names.setName(f"{ps}-{style.replace(' ', '')};dhivehi-font-maker", 3, plat, enc, lang)
        names.setName(f"{family} {style}".strip(), 4, plat, enc, lang)
        names.setName(f"{ps}-{style.replace(' ', '')}", 6, plat, enc, lang)
        names.setName(
            f"Derived from {BASES[params.base].credit} (SIL Open Font License 1.1), restyled with Dhivehi Font Maker.",
            10, plat, enc, lang,
        )
    # style flags must agree with each other or validators complain
    italic, bold = params.slant > 0.01, params.weight >= 700
    sel = font["OS/2"].fsSelection & ~(0x01 | 0x20 | 0x40)
    sel |= (0x01 if italic else 0) | (0x20 if bold else 0) | (0x40 if not italic and not bold else 0)
    font["OS/2"].fsSelection = sel
    font["head"].macStyle = (0x01 if bold else 0) | (0x02 if italic else 0)
    font["OS/2"].usWeightClass = params.weight


def build_play_font(params: PlayParams) -> TTFont:
    p = params.validated()
    base = BASES[p.base]
    if base.variable:
        font = instancer.instantiateVariableFont(TTFont(base.file), {"wght": p.weight}, inplace=False)
    else:
        font = TTFont(base.file)
        d = weight_to_offset(p.weight)
        if d:
            offset_outlines(font, d)
    if p.width != 100 or abs(p.slant) > 0.01 or p.spacing != 0:
        transform_font(font, p.width / 100.0, p.slant, p.spacing)
    _rename(font, p.name, p)
    if "DSIG" in font:      # the original signature is void once the font is changed and renamed
        del font["DSIG"]
    return font


def font_bytes(font: TTFont, flavor: str | None) -> bytes:
    out = io.BytesIO()
    font.flavor = flavor
    font.save(out)
    font.flavor = None
    return out.getvalue()


def build_zip(params: PlayParams) -> tuple[bytes, str]:
    p = params.validated()
    font = build_play_font(p)
    slug = re.sub(r"[^A-Za-z0-9]+", "-", p.name).strip("-") or "font"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{slug}.ttf", font_bytes(font, None))
        z.writestr(f"{slug}.woff2", font_bytes(font, "woff2"))
        z.writestr("OFL.txt", BASES[p.base].licence.read_text())
        z.writestr(
            "README.txt",
            f"{p.name}\n\nA restyled version of {BASES[p.base].credit} (SIL Open Font License 1.1).\n"
            "Install the .ttf on your computer, or use the .woff2 on a website.\n"
            "This font keeps the same licence. See OFL.txt.\n",
        )
    return buf.getvalue(), slug
