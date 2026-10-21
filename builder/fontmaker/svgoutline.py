"""Turn stroked paths (a line with a width) into filled outlines, so imported artwork can become a font."""
from __future__ import annotations

from fontTools.pens.basePen import BasePen
from pydantic import BaseModel, Field

MAX_STROKES = 400
MAX_POINTS = 3000


class P(BaseModel):
    x: float
    y: float


class Seg(BaseModel):
    p: P
    hi: P   # handle into this point, relative to it
    ho: P   # handle out of this point, relative to it


class Stroke(BaseModel):
    width: float = Field(gt=0, le=5000)
    closed: bool = False
    segs: list[Seg] = Field(min_length=2, max_length=MAX_POINTS)


class OutlineRequest(BaseModel):
    strokes: list[Stroke] = Field(min_length=1, max_length=MAX_STROKES)


class _ContourPen(BasePen):
    """Collects cubic outlines as (point, handle-in, handle-out) triples. Quadratics are raised to cubics by BasePen."""

    def __init__(self):
        super().__init__(None)
        self.contours: list[list[dict]] = []
        self._cur: list[dict] | None = None

    def _moveTo(self, pt):
        self._cur = [{"p": pt, "hi": (0.0, 0.0), "ho": (0.0, 0.0)}]

    def _lineTo(self, pt):
        self._cur.append({"p": pt, "hi": (0.0, 0.0), "ho": (0.0, 0.0)})

    def _curveToOne(self, c1, c2, pt):
        a = self._cur[-1]
        a["ho"] = (c1[0] - a["p"][0], c1[1] - a["p"][1])
        self._cur.append({"p": pt, "hi": (c2[0] - pt[0], c2[1] - pt[1]), "ho": (0.0, 0.0)})

    def _closePath(self):
        c = self._cur
        if c and len(c) > 1 and abs(c[0]["p"][0] - c[-1]["p"][0]) < 1e-6 and abs(c[0]["p"][1] - c[-1]["p"][1]) < 1e-6:
            c[0]["hi"] = c[-1]["hi"]
            c.pop()
        if c and len(c) > 2:
            self.contours.append(c)
        self._cur = None

    _endPath = _closePath


def outline_strokes(req: OutlineRequest) -> list[list[dict]]:
    """Each stroke becomes a filled band (round caps and joins). Overlaps are merged so the result has clean outlines."""
    import pathops

    total = pathops.Path()
    for s in req.strokes:
        path = pathops.Path()
        pen = path.getPen()
        first = s.segs[0]
        pen.moveTo((first.p.x, first.p.y))
        count = len(s.segs)
        last = count if s.closed else count - 1
        for i in range(last):
            a, b = s.segs[i], s.segs[(i + 1) % count]
            pen.curveTo(
                (a.p.x + a.ho.x, a.p.y + a.ho.y),
                (b.p.x + b.hi.x, b.p.y + b.hi.y),
                (b.p.x, b.p.y),
            )
        if s.closed:
            pen.closePath()
        else:
            pen.endPath()
        path.stroke(s.width, pathops.LineCap.ROUND_CAP, pathops.LineJoin.ROUND_JOIN, 4)
        path.convertConicsToQuads(0.25)
        total = pathops.op(total, path, pathops.PathOp.UNION, fix_winding=True)
    total.simplify(fix_winding=True, keep_starting_points=False)
    total.convertConicsToQuads(0.25)

    pen = _ContourPen()
    total.draw(pen)
    out = []
    for c in pen.contours:
        out.append([{"p": {"x": round(n["p"][0], 2), "y": round(n["p"][1], 2)},
                     "hi": {"x": round(n["hi"][0], 2), "y": round(n["hi"][1], 2)},
                     "ho": {"x": round(n["ho"][0], 2), "y": round(n["ho"][1], 2)}} for n in c])
    return out
