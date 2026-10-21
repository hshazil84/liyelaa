"""When the font builder is down or failing, the person gets a plain message and a Try again button. Needs web on :3000.
   python3 e2e/builder_down_flow.py"""
import os
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        pg = b.new_context(viewport={"width": 1360, "height": 1000}).new_page()
        mode = {"v": "down"}

        def handle(route):
            if mode["v"] == "down":
                route.abort("connectionrefused")
            elif mode["v"] == "error":
                route.fulfill(status=500, body="boom")
            else:
                route.fulfill(status=200, body=b"ttf", headers={"content-type": "font/ttf", "content-disposition": 'attachment; filename="Test.ttf"', "access-control-allow-origin": "*", "access-control-expose-headers": "content-disposition"})

        pg.route("**/play/build", handle)
        pg.goto(f"{WEB}/play")
        pg.get_by_role("button", name="Save my font").click()
        pg.get_by_role("button", name="Download .ttf").click()
        err = pg.get_by_test_id("build-error")
        err.wait_for()
        t = err.inner_text()
        assert "not answering" in t and "saved in this browser" in t and "Is it running" not in t, t
        assert pg.get_by_test_id("build-retry").is_visible()

        mode["v"] = "error"
        pg.get_by_test_id("build-retry").click()
        pg.wait_for_function("document.querySelector('[data-testid=build-error]')?.innerText.includes('hit a problem')")
        assert pg.get_by_test_id("build-retry").is_visible()

        mode["v"] = "ok"
        with pg.expect_download() as dl:
            pg.get_by_test_id("build-retry").click()
        assert dl.value.suggested_filename == "Test.ttf"
        assert pg.get_by_test_id("build-error").count() == 0, "the message goes away once it works"
        b.close()
    print("builder down flow ok")


main()
