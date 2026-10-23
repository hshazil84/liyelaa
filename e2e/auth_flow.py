"""Sign up, log in, the gate on the tools, the how-it-works pop-up, Terms and Privacy.
Needs the dev server started with NEXT_PUBLIC_SUPABASE_URL=https://test-proj.supabase.co and
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test. The sign-in service is faked here, so no real account is touched."""
import base64, json, sys, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
mode = {"signup": "session", "login": "ok"}

def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b"=").decode()
def jwt(email): return f"{b64({'alg':'HS256','typ':'JWT'})}.{b64({'sub':'u1','email':email,'role':'authenticated','aud':'authenticated','exp':int(time.time())+3600})}.sig"
def user(email, identities=1):
    return {"id": "u1", "aud": "authenticated", "role": "authenticated", "email": email, "created_at": "2026-10-22T00:00:00Z",
            "app_metadata": {}, "user_metadata": {}, "identities": [{"id": "i"}] * identities}
def session(email):
    return {"access_token": jwt(email), "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r", "user": user(email)}

def handler(route):
    req = route.request
    if req.method == "OPTIONS":
        return route.fulfill(status=204, headers=CORS)
    url = req.url
    body = json.loads(req.post_data or "{}") if req.post_data else {}
    def send(status, obj): route.fulfill(status=status, headers={**CORS, "content-type": "application/json"}, body=json.dumps(obj))
    if "/auth/v1/signup" in url:
        m = mode["signup"]
        if m == "session": return send(200, session(body["email"]))
        if m == "confirm": return send(200, user(body["email"]))
        if m == "dupe": return send(200, user(body["email"], identities=0))
    if "/auth/v1/token" in url:
        if mode["login"] == "bad": return send(400, {"error": "invalid_grant", "error_description": "Invalid login credentials", "code": 400, "msg": "Invalid login credentials"})
        return send(200, session(body["email"]))
    if "/auth/v1/recover" in url:
        mode["recover_email"] = body.get("email")
        return send(200, {})
    if "/auth/v1/logout" in url: return route.fulfill(status=204, headers=CORS)
    if "/auth/v1/user" in url: return send(200, user("ada@example.com"))
    return send(404, {})

fails = []
def check(name, cond, extra=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  {extra}" if extra and not cond else ""))
    if not cond: fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    ctx.route("**/auth/v1/**", handler)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))

    # first visit: the pop-up opens by itself
    pg.goto(BASE + "/")
    pg.get_by_test_id("intro-modal").wait_for(timeout=8000)
    check("pop-up opens on a first visit", True)
    check("pop-up lists three steps", pg.locator('[data-testid="intro-modal"] li').count() == 3)
    check("pop-up starts on step 1 with a Next button", "step 1 of 3" in pg.get_by_test_id("intro-count").inner_text().lower() and pg.get_by_test_id("intro-next").is_visible() and pg.get_by_test_id("intro-signup").count() == 0)
    pg.get_by_test_id("intro-next").click(); pg.wait_for_function("document.querySelector('[data-testid=intro-count]').innerText.toLowerCase().includes('step 2')", timeout=4000)
    check("Next moves to step 2", True)
    pg.get_by_test_id("intro-dot-1").click(); pg.wait_for_function("document.querySelector('[data-testid=intro-count]').innerText.toLowerCase().includes('step 1')", timeout=4000)
    check("a dot jumps back to step 1", True)
    pg.keyboard.press("ArrowRight"); pg.keyboard.press("ArrowRight")
    pg.wait_for_function("document.querySelector('[data-testid=intro-count]').innerText.toLowerCase().includes('step 3')", timeout=4000)
    check("arrow keys reach step 3", True)
    check("step 3 has the sign-up button and no login link", pg.get_by_test_id("intro-signup").is_visible() and pg.get_by_test_id("intro-login").count() == 0 and pg.get_by_test_id("intro-next").count() == 0)
    pg.keyboard.press("Escape")
    check("Escape closes the pop-up", pg.get_by_test_id("intro-modal").count() == 0)
    pg.reload(); pg.wait_for_timeout(1200)
    check("pop-up does not come back after closing", pg.get_by_test_id("intro-modal").count() == 0)
    pg.get_by_test_id("open-intro").click()
    check("How it works link reopens it on step 1", pg.get_by_test_id("intro-modal").is_visible() and "step 1 of 3" in pg.get_by_test_id("intro-count").inner_text().lower())
    pg.get_by_test_id("intro-close").click()
    pg.get_by_test_id("account-open").click()
    check("logged-out panel has no My fonts section", pg.get_by_test_id("account-fonts").count() == 0 and pg.get_by_test_id("account-save").count() == 0)
    check("logged-out panel keeps Help and Terms", pg.get_by_test_id("feedback-open").is_visible() and pg.get_by_test_id("account-panel").get_by_role("link", name="Terms").is_visible())
    pg.keyboard.press("Escape")
    check("home shows Log in and Sign up", pg.get_by_test_id("nav-login").is_visible() and pg.get_by_test_id("nav-signup").is_visible())
    check("home shows the sign-up button under How it works", pg.get_by_test_id("cta-signup").is_visible())
    check("footer has Terms, Privacy and Instagram",
          pg.get_by_test_id("site-footer").get_by_role("link", name="Terms").is_visible()
          and pg.get_by_test_id("site-footer").get_by_role("link", name="Privacy").is_visible()
          and pg.get_by_test_id("site-footer").locator('a[href="https://instagram.com/thaanafont"]').count() == 1)
    check("footer says 2026", "© 2026 ThaanaFont" in pg.get_by_test_id("site-footer").inner_text())

    # the gate
    for path in ["/play", "/draw", "/handwriting", "/handwriting/letters"]:
        pg.goto(BASE + path)
        pg.wait_for_url("**/signup?next=*", timeout=8000)
        check(f"{path} sends a signed-out visitor to sign up", "next=" + path.replace("/", "%2F") in pg.url, pg.url)
    pg.goto(BASE + "/play"); pg.wait_for_url("**/signup?next=*")

    # sign-up checks
    form = pg.get_by_test_id("signup-form")
    pg.get_by_test_id("auth-submit").click()
    check("empty form is refused", "email" in pg.get_by_test_id("auth-error").inner_text().lower())
    pg.get_by_test_id("auth-email").fill("ada@example.com"); pg.get_by_test_id("auth-password").fill("short")
    pg.get_by_test_id("auth-submit").click()
    check("short password is refused", "8 characters" in pg.get_by_test_id("auth-error").inner_text())
    pg.get_by_test_id("auth-password").fill("longenough1")
    pg.get_by_test_id("auth-submit").click()
    check("Terms box is required", "Terms" in pg.get_by_test_id("auth-error").inner_text())

    # duplicate address
    mode["signup"] = "dupe"
    pg.get_by_test_id("auth-agree").check(); pg.get_by_test_id("auth-submit").click()
    pg.wait_for_function("document.querySelector('[data-testid=auth-error]')?.innerText.includes('already')", timeout=5000)
    check("existing address says so", True)

    # confirmation required
    mode["signup"] = "confirm"
    pg.get_by_test_id("auth-submit").click()
    pg.get_by_test_id("auth-notice").wait_for(timeout=5000)
    check("confirmation email message", "Check your email" in pg.get_by_test_id("auth-notice").inner_text())

    # success: lands back on the page they wanted
    mode["signup"] = "session"
    pg.get_by_test_id("auth-submit").click()
    pg.wait_for_url("**/play", timeout=8000)
    pg.get_by_role("heading", name="Play with a font").wait_for(timeout=10000)
    check("sign-up returns to the tool they asked for", pg.url.endswith("/play"))

    # signed in: home
    pg.goto(BASE + "/"); pg.wait_for_timeout(1500)
    check("no pop-up when signed in", pg.get_by_test_id("intro-modal").count() == 0)
    pg.get_by_test_id("account-open").click()
    check("signed-in panel has My fonts", pg.get_by_test_id("account-fonts").is_visible() and pg.get_by_test_id("account-save").is_visible())
    check("the account panel shows the email and Log out", pg.get_by_test_id("nav-email").inner_text() == "ada@example.com" and pg.get_by_test_id("nav-logout").is_visible())
    check("no sign-up button when signed in", pg.get_by_test_id("cta-signup").count() == 0)
    pg.keyboard.press("Escape")
    pg.get_by_test_id("open-intro").click()
    pg.get_by_test_id("intro-next").click(); pg.wait_for_timeout(500); pg.get_by_test_id("intro-next").click(); pg.get_by_test_id("intro-ok").wait_for(timeout=4000)
    check("signed-in pop-up has no sign-up button", pg.get_by_test_id("intro-signup").count() == 0 and pg.get_by_test_id("intro-ok").is_visible())
    pg.get_by_test_id("intro-ok").click()
    pg.goto(BASE + "/signup"); pg.wait_for_url(BASE + "/", timeout=8000)
    check("signed-in visitors skip the sign-up page", True)

    # still signed in after a reload; tools open
    pg.goto(BASE + "/draw"); pg.wait_for_timeout(2500)
    check("tools open when signed in", "/signup" not in pg.url and pg.get_by_test_id("auth-wait").count() == 0)

    # log out
    pg.goto(BASE + "/"); pg.get_by_test_id("account-open").click(); pg.get_by_test_id("nav-logout").click()
    pg.get_by_test_id("nav-login").wait_for(timeout=5000)
    check("Log out works", True)
    pg.goto(BASE + "/play"); pg.wait_for_url("**/signup?next=*", timeout=8000)
    check("after Log out the gate closes again", True)

    # log in
    pg.goto(BASE + "/login?next=/handwriting")
    mode["login"] = "bad"
    pg.get_by_test_id("auth-email").fill("ada@example.com"); pg.get_by_test_id("auth-password").fill("nope-nope")
    pg.get_by_test_id("auth-submit").click()
    pg.get_by_test_id("auth-error").wait_for(timeout=5000)
    check("wrong password message", pg.get_by_test_id("auth-error").inner_text() == "Wrong email or password.")
    mode["login"] = "ok"
    pg.get_by_test_id("auth-submit").click()
    pg.wait_for_url("**/handwriting", timeout=8000)
    check("log in returns to the page they wanted", True)
    pg.get_by_test_id("auth-wait").wait_for(state="detached", timeout=8000) if pg.get_by_test_id("auth-wait").count() else None

    # forgot password
    pg.goto(BASE + "/"); pg.get_by_test_id("account-open").click(); pg.get_by_test_id("nav-logout").click(); pg.get_by_test_id("nav-login").wait_for()
    pg.goto(BASE + "/login")
    check("Log in page has a Forgot password link", pg.get_by_test_id("forgot-link").is_visible())
    pg.get_by_test_id("forgot-link").click(); pg.wait_for_url("**/forgot-password")
    check("forgot page has no password field", pg.get_by_test_id("auth-password").count() == 0)
    pg.get_by_test_id("auth-submit").click()
    check("forgot page asks for the email", "email" in pg.get_by_test_id("auth-error").inner_text().lower())
    pg.get_by_test_id("auth-email").fill("ada@example.com"); pg.get_by_test_id("auth-submit").click()
    pg.get_by_test_id("auth-notice").wait_for(timeout=5000)
    check("reset link message is neutral", "If that address has an account" in pg.get_by_test_id("auth-notice").inner_text())
    check("the reset request carried the email", mode.get("recover_email") == "ada@example.com")
    check("Back to log in link", pg.get_by_test_id("auth-switch").inner_text() == "Back to log in")

    # the reset link lands here with tokens in the address
    pg.goto(BASE + "/reset-password"); pg.get_by_test_id("reset-bad").wait_for(timeout=5000)
    check("opening the reset page with no link says it has expired", "expired" in pg.get_by_test_id("reset-bad").inner_text())
    tok = jwt("ada@example.com")
    pg.goto("about:blank")
    pg.goto(BASE + f"/reset-password#access_token={tok}&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery")
    pg.get_by_test_id("reset-form").wait_for(timeout=8000)
    check("a good reset link shows the new password form", True)
    check("tokens are cleared from the address bar", "access_token" not in pg.url, pg.url)
    pg.get_by_test_id("reset-password").fill("short"); pg.get_by_test_id("reset-submit").click()
    check("short new password is refused", "8 characters" in pg.get_by_test_id("auth-error").inner_text())
    pg.get_by_test_id("reset-password").fill("brand-new-pass1"); pg.get_by_test_id("reset-submit").click()
    pg.wait_for_url(BASE + "/", timeout=8000)
    check("saving a new password returns home", True)
    pg.goto("about:blank")
    pg.goto(BASE + "/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")
    pg.get_by_test_id("reset-bad").wait_for(timeout=5000)
    check("an expired link from Supabase shows the expired message", True)

    # next= can never leave the site
    pg.goto(BASE + "/"); pg.wait_for_timeout(1500); pg.get_by_test_id("account-open").click(); pg.get_by_test_id("nav-logout").click(); pg.get_by_test_id("nav-login").wait_for()
    pg.goto(BASE + "/login?next=//evil.example.com")
    pg.get_by_test_id("auth-email").fill("ada@example.com"); pg.get_by_test_id("auth-password").fill("longenough1")
    pg.get_by_test_id("auth-submit").click()
    pg.wait_for_url(BASE + "/", timeout=8000)
    check("next= to another site is ignored", True)

    # legal pages
    pg.goto(BASE + "/terms")
    check("Terms page", pg.get_by_role("heading", name="Terms", level=1).is_visible() and "Last updated 22 October 2026" in pg.inner_text("main"))
    check("Terms mention the beta", "beta" in pg.inner_text("main"))
    pg.get_by_test_id("site-footer").get_by_role("link", name="Privacy").click()
    pg.wait_for_url("**/privacy")
    check("Privacy page", pg.get_by_role("heading", name="Privacy note", level=1).is_visible() and "Photos are never uploaded" in pg.inner_text("main"))
    check("no company names on the Privacy page", not any(n in pg.inner_text("main") for n in ("Supabase", "Vercel", "Render")))

    # phone
    ph = ctx.new_page(); ph.set_viewport_size({"width": 390, "height": 800})
    ph.goto(BASE + "/"); ph.wait_for_timeout(800)
    ph.evaluate("localStorage.clear()")
    ph.reload(); ph.get_by_test_id("intro-modal").wait_for(timeout=8000)
    box = ph.get_by_test_id("intro-modal").bounding_box()
    check("pop-up fits a phone", box["x"] >= 0 and box["x"] + box["width"] <= 390, str(box))
    check("phone does not scroll sideways", ph.evaluate("document.documentElement.scrollWidth") <= 390)
    ph.get_by_test_id("intro-next").click(); ph.wait_for_timeout(500); ph.get_by_test_id("intro-next").click()
    ph.get_by_test_id("intro-signup").wait_for(timeout=4000)
    ph.get_by_test_id("intro-signup").click(); ph.wait_for_url("**/signup")
    check("phone sign-up form no sideways scroll", ph.evaluate("document.documentElement.scrollWidth") <= 390)

    check("no page errors", not errs, "; ".join(errs[:3]))
    b.close()

print("\nFAILED: " + ", ".join(fails) if fails else "\nall passed")
sys.exit(1 if fails else 0)
