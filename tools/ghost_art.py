"""Hint letters drawn by hand instead of set in a font. Each SVG in tools/ghost_art/ replaces the grey hint for one label.
It is fitted into the same box as the hint it replaces (same width, same middle), so the drawing board does not change.
Run on its own to patch web/lib/handwriting/ghosts.json:   python3 tools/ghost_art.py
make_ghosts.py applies the same step after it rebuilds the file."""
import json
from pathlib import Path
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
import re

ROOT = Path(__file__).resolve().parent.parent
ART = {"﷽": "bismillah.svg"}          # label -> file in tools/ghost_art/
fmt = lambda v: f"{v:.1f}".rstrip("0").rstrip(".")


def path_of(svg: Path):
    """All the shapes of an SVG as one outline, y down as drawn."""
    text = svg.read_text()
    ds = re.findall(r'<path[^>]* d="([^"]+)"', text)
    box = [float(v) for v in re.search(r'viewBox="([^"]+)"', text).group(1).replace(",", " ").split()]
    return ds, box


def bounds_of(d: str):
    from fontTools.pens.recordingPen import RecordingPen
    pen = BoundsPen(None); parse_path(d, pen); return pen.bounds


def fit(label: str, old: dict | None, file: str) -> dict:
    ds, _ = path_of(ROOT / "tools/ghost_art" / file)
    x0 = y0 = float("inf"); x1 = y1 = float("-inf")
    for d in ds:
        b = bounds_of(d)
        x0, y0, x1, y1 = min(x0, b[0]), min(y0, b[1]), max(x1, b[2]), max(y1, b[3])
    aw, ah = x1 - x0, y1 - y0
    if old:
        ob = BoundsPen(None); parse_path(old["d"], ob); ox0, oy0, ox1, oy1 = ob.bounds
        adv, cw, cx, cy = old["adv"], ox1 - ox0, (ox0 + ox1) / 2, (oy0 + oy1) / 2
    else:
        adv, cw, cx, cy = 1400.0, 1000.0, 700.0, 250.0
    k = cw / aw                                   # same width as the hint it replaces
    pen = SVGPathPen(None, ntos=fmt)
    for d in ds:
        # y flips, since the artwork is drawn y down and the board is y up
        parse_path(d, TransformPen(pen, (k, 0, 0, -k, cx - (x0 + aw / 2) * k, cy + (y0 + ah / 2) * k)))
    return {"d": pen.getCommands(), "adv": adv}


def patch(out: dict) -> dict:
    for label, file in ART.items():
        out[label] = fit(label, out.get(label), file)
    return out


if __name__ == "__main__":
    f = ROOT / "web/lib/handwriting/ghosts.json"
    data = json.loads(f.read_text())
    f.write_text(json.dumps(patch(data), ensure_ascii=False, separators=(",", ":")))
    e = data["﷽"]; print("bismillah hint:", len(e["d"]), "chars, adv", e["adv"])
