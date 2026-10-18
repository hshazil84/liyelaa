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
