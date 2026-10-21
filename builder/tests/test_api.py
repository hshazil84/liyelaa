import io
import zipfile

from fastapi.testclient import TestClient
from fontTools.ttLib import TTFont

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"ok": True}


def test_zip_download():
    r = client.post("/play/build", json={"weight": 700, "name": "Bold Test"})
    assert r.status_code == 200
    assert r.headers["content-disposition"] == 'attachment; filename="Bold-Test.zip"'
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert "Bold-Test.ttf" in z.namelist()


def test_single_formats():
    ttf = client.post("/play/build", json={"format": "ttf", "slant": 8})
    assert ttf.status_code == 200 and TTFont(io.BytesIO(ttf.content))["post"].italicAngle < 0
    woff = client.post("/play/build", json={"format": "woff2"})
    assert woff.status_code == 200 and TTFont(io.BytesIO(woff.content)).flavor == "woff2"


def test_rejects_bad_values():
    assert client.post("/play/build", json={"weight": 1000}).status_code == 422
    assert client.post("/play/build", json={"format": "exe"}).status_code == 422


def test_cors_only_for_allowed_origin():
    ok = client.options("/play/build", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"})
    bad = client.options("/play/build", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "access-control-allow-origin" not in bad.headers


def test_sangu_base_builds_and_unknown_base_is_rejected():
    r = client.post("/play/build", json={"base": "sangu", "weight": 900, "format": "woff2"})
    assert r.status_code == 200
    f = TTFont(io.BytesIO(r.content))
    assert "Sangu Suruhee" in f["name"].getDebugName(10)
    assert client.post("/play/build", json={"base": "arial"}).status_code == 422


def test_haluvidhaa_base_builds_with_its_licence_credit():
    r = client.post("/play/build", json={"base": "haluvidhaa", "weight": 700, "format": "woff2"})
    assert r.status_code == 200
    f = TTFont(io.BytesIO(r.content))
    assert "Haluvidhaa" in f["name"].getDebugName(10)


def test_hawwa_base_builds_with_its_licence_credit():
    r = client.post("/play/build", json={"base": "hawwa", "weight": 700, "format": "woff2"})
    assert r.status_code == 200
    assert "Hawwa" in TTFont(io.BytesIO(r.content))["name"].getDebugName(10)


# ----------------------------------------------------------------------------- handwriting build
def _hw_payload(**extra):
    sq = lambda x0, y0, x1, y1: [{"p": {"x": x, "y": y}, "hi": {"x": 0, "y": 0}, "ho": {"x": 0, "y": 0}} for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    return {"name": "Api Hand", "glyphs": [
        {"id": "0784", "cp": [0x784], "contours": [sq(40, 0, 300, 400)], "adv": 380},
        {"id": "07A6", "cp": [0x7A6], "contours": [sq(-30, 350, 30, 400)], "adv": 0},
    ], **extra}


def test_handwriting_build_zip_and_headers():
    r = client.post("/handwriting/build", json=_hw_payload())
    assert r.status_code == 200
    assert r.headers["content-disposition"] == 'attachment; filename="Api-Hand.zip"'
    assert int(r.headers["x-dfm-drawn"]) == 2 and "0786" in r.headers["x-dfm-filled"].split(",")
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert {"Api-Hand.ttf", "Api-Hand.woff2", "OFL.txt"} <= set(z.namelist())


def test_handwriting_build_single_formats_without_starter_font():
    r = client.post("/handwriting/build", json=_hw_payload(format="ttf", fallback="none"))
    assert r.status_code == 200 and r.headers["x-dfm-filled"] == ""
    assert 0x0784 in TTFont(io.BytesIO(r.content)).getBestCmap() and 0x0786 not in TTFont(io.BytesIO(r.content)).getBestCmap()


def test_handwriting_build_rejects_bad_requests():
    assert client.post("/handwriting/build", json=_hw_payload(licence="private")).status_code == 422       # starter font + private
    assert client.post("/handwriting/build", json={"glyphs": [{"id": "x", "cp": [5], "contours": [], "adv": 1}]}).status_code == 422
    assert client.post("/handwriting/build", json={"glyphs": "nope"}).status_code == 422
    assert client.post("/handwriting/build", json=_hw_payload(format="exe")).status_code == 422


def test_a_visitor_who_builds_too_often_is_told_to_wait(monkeypatch):
    import app.main as m
    monkeypatch.setattr(m, "RATE_PER_MIN", 3)
    m._hits.clear()
    body = {"name": "T", "format": "ttf", "glyphs": []}
    hdr = {"x-forwarded-for": "203.0.113.9"}
    codes = [client.post("/handwriting/build", json=body, headers=hdr).status_code for _ in range(5)]
    assert codes[3:] == [429, 429], codes
    assert client.post("/handwriting/build", json=body, headers={"x-forwarded-for": "203.0.113.10"}).status_code != 429, "another visitor is not affected"
    assert client.get("/health", headers=hdr).status_code == 200, "reading is never limited"
    m._hits.clear()


# ----------------------------------------------------------------------------- stroke outlines
def _z():
    return {"x": 0, "y": 0}


def test_svg_outline_turns_a_stroked_line_into_a_filled_shape():
    segs = [{"p": {"x": 0, "y": 0}, "hi": _z(), "ho": _z()}, {"p": {"x": 100, "y": 0}, "hi": _z(), "ho": _z()}]
    r = client.post("/svg/outline", json={"strokes": [{"width": 20, "closed": False, "segs": segs}]})
    assert r.status_code == 200
    contours = r.json()["contours"]
    assert len(contours) == 1
    xs = [n["p"]["x"] for n in contours[0]]
    ys = [n["p"]["y"] for n in contours[0]]
    assert min(xs) < -9 and max(xs) > 109          # round caps stick out by half the width
    assert min(ys) < -9 and max(ys) > 9            # and the band is 20 wide


def test_svg_outline_merges_overlapping_strokes_and_rejects_bad_input():
    def seg(x0, y0, x1, y1):
        return [{"p": {"x": x0, "y": y0}, "hi": _z(), "ho": _z()}, {"p": {"x": x1, "y": y1}, "hi": _z(), "ho": _z()}]
    two = [{"width": 20, "closed": False, "segs": seg(0, 0, 100, 0)}, {"width": 20, "closed": False, "segs": seg(50, -50, 50, 50)}]
    r = client.post("/svg/outline", json={"strokes": two})
    assert r.status_code == 200 and len(r.json()["contours"]) == 1     # a plus sign is one outline
    assert client.post("/svg/outline", json={"strokes": []}).status_code == 422
    assert client.post("/svg/outline", json={"strokes": [{"width": 0, "segs": seg(0, 0, 1, 1)}]}).status_code == 422
