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
