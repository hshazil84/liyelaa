"""Outline the grey hint letters so the editor never has to draw big text (Safari cuts that off).
Writes web/lib/handwriting/ghosts.json: label -> {d, adv} in 1000-unit em, y up.   python3 tools/make_ghosts.py"""
import json, io
from pathlib import Path
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
layout = json.loads((ROOT / "web/lib/template-layout.json").read_text())
labels = sorted({c["label"] for s in layout["sheets"] for c in s["cells"] if c.get("label")} - set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"))

def load(path, wght=None):
    f = TTFont(str(path))
    if wght: f = instancer.instantiateVariableFont(f, {"wght": wght})
    buf = io.BytesIO(); f.flavor = None; f.save(buf); data = buf.getvalue()
    return TTFont(io.BytesIO(data)), hb.Font(hb.Face(data))

fonts = [load(ROOT / "web/public/fonts/AKRasmee-2.0.woff2"), load(ROOT / "builder/assets/NotoSansThaana-Variable.ttf", 400)]

def outline(label):
    for tt, hf in fonts:
        buf = hb.Buffer(); buf.add_str(label); buf.guess_segment_properties(); buf.direction = "rtl"; buf.script = "Thaa"
        hb.shape(hf, buf, {})
        if any(i.codepoint == 0 for i in buf.glyph_infos): continue
        k = 1000 / tt["head"].unitsPerEm
        order = tt.getGlyphOrder(); gs = tt.getGlyphSet()
        x = 0; pen = SVGPathPen(gs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            tp = TransformPen(pen, (k, 0, 0, k, (x + pos.x_offset) * k, pos.y_offset * k))
            gs[order[info.codepoint]].draw(tp)
            x += pos.x_advance
        return {"d": pen.getCommands(), "adv": round(x * k, 1)}
    return None

out, miss = {}, []

# English letters: Inter, shrunk so capitals are as tall as the Thaana letters (494 units; Inter's capitals are 727)
LATIN_SCALE = 494 / 727
inter = TTFont(str(ROOT / "builder/assets/Inter-Latin-Regular.ttf"))
igs, icm, ik = inter.getGlyphSet(), inter.getBestCmap(), 1000 / inter["head"].unitsPerEm * LATIN_SCALE
for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz":
    pen = SVGPathPen(igs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
    igs[icm[ord(ch)]].draw(TransformPen(pen, (ik, 0, 0, ik, 0, 0)))
    out[ch] = {"d": pen.getCommands(), "adv": round(igs[icm[ord(ch)]].width * ik, 1)}

for l in labels:
    o = outline(l)
    if o and o["d"]: out[l] = o
    else: miss.append(l)
(ROOT / "web/lib/handwriting/ghosts.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print(len(out), "outlined;", "missing:", miss)
