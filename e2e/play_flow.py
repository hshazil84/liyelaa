"""End-to-end check of the Play path. Needs the builder on :8000 and the web app on :3000.
   python3 e2e/play_flow.py [outdir]"""
import io, os, sys, tempfile
import numpy as np
from PIL import Image
from fontTools.ttLib import TTFont
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
OUT = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(OUT, exist_ok=True)
CHROMIUM = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
TEXT = "ތާނަ ފޮންޓު"


def ink_bbox(png: bytes):
    a = np.asarray(Image.open(io.BytesIO(png)).convert("L")) < 128
    ys, xs = np.where(a)
    return a, (xs.min(), ys.min(), xs.max(), ys.max())


def real_ink(ctx, ttf_path):
    import base64
    page = ctx.new_page()
    b64 = base64.b64encode(open(ttf_path, "rb").read()).decode()
    page.set_content(f"""<style>@font-face{{font-family:T;src:url(data:font/ttf;base64,{b64})}}
      body{{margin:0;background:#fff}} div{{font:96px/1.6 T;padding:24px;display:inline-block;direction:rtl}}</style>
      <div id=x lang=dv>{TEXT}</div>""")
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(400)
    assert page.evaluate("document.fonts.check('96px T')"), "downloaded font did not load"
    png = page.locator("#x").screenshot()
    page.close()
    return ink_bbox(png)


def sangu_flow(ctx, errors):
    """A one-weight base: the preview comes from the builder and must match the downloaded font."""
    pg = ctx.new_page()
    pg.goto(WEB + "/play")
    pg.evaluate("localStorage.clear()")
    pg.reload()
    ready = '[data-testid=preview][data-preview-state=ready]'
    assert pg.locator('[data-testid=preview][data-preview-state=idle]').count() == 1       # Noto: no builder round trip
    pg.get_by_role("radio", name="Sangu Suruhee").click()
    pg.wait_for_selector(ready)
    assert "has one weight" in pg.locator("main").inner_text()
    inks = {}
    for w in (100, 400, 900):
        pg.locator("#s-weight").fill(str(w))
        pg.wait_for_timeout(500)
        pg.wait_for_selector(ready)
        a, bb = ink_bbox(pg.locator('div[aria-label="Preview"]').screenshot())
        inks[w] = int(a.sum())
    assert inks[100] < inks[400] < inks[900], inks              # thinner -> less ink, bolder -> more
    pg.locator("#s-weight").fill("800")
    pg.locator("#s-width").fill("110")
    pg.locator("#s-slant").fill("8")
    pg.locator("#s-spacing").fill("20")
    pg.wait_for_timeout(500)
    pg.wait_for_selector(ready)
    preview_png = pg.locator('div[aria-label="Preview"]').screenshot()
    pg.reload()                                                  # base choice survives a reload
    pg.wait_for_selector(ready)
    assert pg.get_by_role("radio", name="Sangu Suruhee").get_attribute("aria-checked") == "true"
    pg.get_by_role("button", name="Save my font").click()
    pg.get_by_label("Font name").fill("Sangu Test")
    assert "Based on Sangu Suruhee by Thaana Type Foundry" in pg.locator("main").inner_text()
    with pg.expect_download() as d:
        pg.get_by_role("button", name="Download .ttf").click()
    path = f"{OUT}/sangu.ttf"
    d.value.save_as(path)
    f = TTFont(path)
    assert f["name"].getDebugName(1) == "Sangu Test" and "Sangu Suruhee" in f["name"].getDebugName(10)
    assert f["OS/2"].usWeightClass == 800 and f["post"].italicAngle < 0
    a1, b1 = ink_bbox(preview_png)
    a2, b2 = real_ink(ctx, path)
    w1, h1, w2, h2 = b1[2]-b1[0], b1[3]-b1[1], b2[2]-b2[0], b2[3]-b2[1]
    print(f"sangu: ink by weight {inks}; preview {w1}x{h1}px, real font {w2}x{h2}px")
    assert abs(w1 - w2) / w2 < 0.06 and abs(h1 - h2) / h2 < 0.06, "Sangu preview does not match the built font"
    # builder unreachable: the page must say so instead of freezing
    pg.get_by_role("button", name="Back to playing").click()
    pg.route("**/play/build", lambda r: r.abort())
    pg.locator("#s-weight").fill("300")
    pg.wait_for_selector('[data-testid=preview][data-preview-state=error]')
    assert "The font maker is not answering" in pg.locator("main").inner_text()
    pg.unroute("**/play/build")
    pg.close()
    errors[:] = [e for e in errors if "ERR_FAILED" not in e and "Failed to load resource" not in e]
    assert not errors, errors


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROMIUM) if CHROMIUM else p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 820}, accept_downloads=True)
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        pg.goto(WEB)
        assert pg.get_by_role("heading", name="What do you want to do?").is_visible()
        pg.screenshot(path=f"{OUT}/1-start.png")

        pg.get_by_role("link", name="Start playing").click()
        pg.wait_for_url("**/play")
        pg.get_by_role("button", name="Bold", exact=True).click()
        pg.locator("#s-width").fill("110")
        pg.locator("#s-slant").fill("10")
        pg.locator("#s-spacing").fill("20")
        pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/2-play.png")
        preview_png = pg.locator('[aria-label="Preview"] >> nth=1').screenshot() if pg.locator('[aria-label="Preview"]').count() > 1 else pg.locator('div[aria-label="Preview"]').screenshot()

        # settings survive a reload (stored in this browser)
        pg.reload()
        pg.wait_for_function("document.querySelector('#s-width')?.value === '110'", timeout=5000)
        assert pg.locator("#s-width").input_value() == "110", "settings were not remembered"

        pg.get_by_role("button", name="Save my font").click()
        pg.get_by_label("Font name").fill("Test Bold")
        pg.screenshot(path=f"{OUT}/3-save.png")
        with pg.expect_download() as d:
            pg.get_by_role("button", name="Download .ttf").click()
        ttf_path = f"{OUT}/downloaded.ttf"
        d.value.save_as(ttf_path)
        assert d.value.suggested_filename == "Test-Bold.ttf", d.value.suggested_filename
        with pg.expect_download() as d2:
            pg.get_by_role("button", name="Download both (.zip)").click()
        assert d2.value.suggested_filename == "Test-Bold.zip"
        assert not errors, errors

        f = TTFont(ttf_path)
        assert f["name"].getDebugName(1) == "Test Bold"
        assert f["OS/2"].usWeightClass == 700 and f["post"].italicAngle < 0
        print("downloaded font:", f["name"].getDebugName(4), "weight", f["OS/2"].usWeightClass, "angle", f["post"].italicAngle)

        # does the live preview match the real built font?
        pg2 = ctx.new_page()
        import base64
        b64 = base64.b64encode(open(ttf_path, "rb").read()).decode()
        pg2.set_content(f"""<style>@font-face{{font-family:T;src:url(data:font/ttf;base64,{b64})}}
          body{{margin:0;background:#fff}} div{{font:96px/1.6 T;padding:24px;display:inline-block;direction:rtl}}</style>
          <div id=x lang=dv>{TEXT}</div>""")
        pg2.evaluate("document.fonts.ready")
        pg2.wait_for_timeout(400)
        assert pg2.evaluate("document.fonts.check('96px T')"), "downloaded font did not load"
        real_png = pg2.locator("#x").screenshot()
        Image.open(io.BytesIO(preview_png)).save(f"{OUT}/preview-css.png")
        Image.open(io.BytesIO(real_png)).save(f"{OUT}/preview-real.png")
        a1, b1 = ink_bbox(preview_png)
        a2, b2 = ink_bbox(real_png)
        w1, h1, w2, h2 = b1[2]-b1[0], b1[3]-b1[1], b2[2]-b2[0], b2[3]-b2[1]
        print(f"preview ink {w1}x{h1}px  real font ink {w2}x{h2}px")
        assert abs(w1 - w2) / w2 < 0.06 and abs(h1 - h2) / h2 < 0.06, "preview does not match the built font"
        sangu_flow(ctx, errors)
        b.close()
    print("PLAY FLOW OK ->", OUT)


main()
