"""The admin: sign-in gate, Overview, People (search, filter, note, CSV), Emails (test, confirm, send), Sales, and the unsubscribe page.
Runs against a fake Supabase and a fake Resend on :54321, so it needs the web app started like this (not the usual dev server):

  cd web && NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test RESEND_API_KEY=test RESEND_API_URL=http://localhost:54321 npx next dev -p 3000

python3 e2e/admin_flow.py"""
import json, os, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

WEB = os.environ.get("WEB_URL", "http://localhost:3000")
CHROME = "/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None
ME = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
TOKEN = "33333333-3333-4333-8333-333333333333"

PEOPLE = [
    {"id": ME, "email": "hshazil@gmail.com", "joined": "2026-10-23T07:23:00Z", "last_seen": "2026-10-23T16:00:00Z", "fonts": 2, "downloads": 1, "marketing_ok": True, "tags": ["owner"], "note": ""},
    {"id": OTHER, "email": "aishath@example.mv", "joined": "2026-10-24T07:23:00Z", "last_seen": None, "fonts": 0, "downloads": 0, "marketing_ok": False, "tags": [], "note": "asked about joined letters"},
    {"id": "44444444-4444-4444-8444-444444444444", "email": "niyaz@example.mv", "joined": "2026-10-25T07:23:00Z", "last_seen": "2026-10-25T08:00:00Z", "fonts": 1, "downloads": 0, "marketing_ok": True, "tags": [], "note": ""},
]
OVERVIEW = {"visits": 1284, "visits_prev": 1088, "signups": 212, "signups_prev": 194, "started": 164, "downloads": 47, "active_week": 31,
            "by_path": {"photo": 98, "draw": 58, "svg": 8}, "by_format": {"ttf": 31, "woff2": 19, "zip": 24}, "avg_letters": 36,
            "daily": [{"day": f"2026-10-{19 + i}", "n": [3, 5, 9, 7, 12, 8, 10][i]} for i in range(7)]}
EVENTS = [{"name": "download_ttf", "props": {"letters": 38}, "at": "2026-10-23T15:00:00Z"}, {"name": "font_started", "props": {"path": "photo"}, "at": "2026-10-23T14:00:00Z"}, {"name": "signup", "props": {}, "at": "2026-10-23T07:23:00Z"}]

calls = []     # every database function the page called, with its arguments
mails = []     # every batch sent to the fake Resend


class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        for k, v in (("Access-Control-Allow-Origin", "*"), ("Access-Control-Allow-Headers", "*"), ("Access-Control-Allow-Methods", "*"), ("Content-Type", "application/json")):
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self): self._send(204, {})

    def do_GET(self):
        who = self.headers.get("Authorization", "").replace("Bearer ", "")
        if urlparse(self.path).path == "/auth/v1/user":
            self._send(200, {"id": ME if who == "admin-token" else OTHER, "email": "hshazil@gmail.com" if who == "admin-token" else "aishath@example.mv", "aud": "authenticated"})
        else: self._send(404, {})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"null")
        who = self.headers.get("Authorization", "").replace("Bearer ", "")
        path = urlparse(self.path).path
        if path == "/emails/batch":
            mails.append(body); return self._send(200, {"data": [{"id": f"e{i}"} for i in range(len(body))]})
        fn = path.rsplit("/", 1)[-1]
        calls.append((fn, body, who))
        if fn == "is_admin": return self._send(200, who == "admin-token")
        if fn == "unsubscribe": return self._send(200, body.get("p_token") == TOKEN)
        if who != "admin-token": return self._send(403, {"message": "not allowed"})
        if fn == "admin_overview": return self._send(200, OVERVIEW)
        if fn == "admin_people":
            rows = [p for p in PEOPLE if (not body.get("p_search") or body["p_search"] in p["email"] or body["p_search"] in p["note"])]
            if body.get("p_filter") == "opted_in": rows = [p for p in rows if p["marketing_ok"]]
            return self._send(200, {"total": len(rows), "rows": rows})
        if fn == "admin_person_events": return self._send(200, EVENTS)
        if fn == "admin_set_note": return self._send(200, None)
        if fn == "admin_audience":
            rows = [{"id": p["id"], "email": p["email"], "token": TOKEN} for p in PEOPLE if p["marketing_ok"]]
            return self._send(200, {"count": len(rows), "rows": rows})
        if fn == "admin_sent_emails": return self._send(200, [{"id": 1, "subject": "Welcome to the beta", "audience": "all", "recipients": 2, "at": "2026-10-25T10:00:00Z"}])
        if fn == "admin_log_email": return self._send(200, None)
        self._send(404, {})


def session(token, email, uid):
    return json.dumps({"access_token": token, "refresh_token": "r", "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600,
                       "user": {"id": uid, "email": email, "aud": "authenticated", "app_metadata": {}, "user_metadata": {}, "created_at": "2026-10-23T00:00:00Z"}})


def called(fn): return [c for c in calls if c[0] == fn]


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", 54321), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME)

        def page_as(token, email, uid):
            ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
            if token: ctx.add_init_script(f"localStorage.setItem('sb-localhost-auth-token', {json.dumps(session(token, email, uid))})")
            return ctx.new_page()

        # signed out, then signed in but not an admin
        pg = page_as(None, None, None)
        pg.goto(f"{WEB}/admin"); pg.get_by_test_id("admin-gate").wait_for()
        assert "Log in" in pg.get_by_test_id("admin-gate").inner_text() or pg.get_by_role("link", name="Log in").is_visible()
        pg.context.close()
        pg = page_as("other-token", "aishath@example.mv", OTHER)
        pg.goto(f"{WEB}/admin"); pg.get_by_test_id("admin-gate").wait_for()
        assert "only for the site owner" in pg.get_by_test_id("admin-gate").inner_text(), pg.get_by_test_id("admin-gate").inner_text()
        assert pg.get_by_test_id("tab-people").count() == 0
        pg.context.close()
        print("gate ok")

        # admin: Overview
        pg = page_as("admin-token", "hshazil@gmail.com", ME)
        pg.goto(f"{WEB}/admin"); pg.get_by_test_id("overview").wait_for()
        assert pg.get_by_test_id("stat-visits").inner_text().startswith("1,284"), pg.get_by_test_id("stat-visits").inner_text()
        assert "+18%" in pg.get_by_test_id("stat-visits").inner_text()
        assert "47" in pg.get_by_test_id("stat-downloads").inner_text()
        assert "17%" in pg.get_by_test_id("funnel-1").inner_text(), pg.get_by_test_id("funnel-1").inner_text()   # 212 of 1,284
        assert "Average letters drawn at download: 36 of 38" in pg.inner_text("body")
        pg.get_by_test_id("range-30").click()
        pg.wait_for_function("() => true"); time.sleep(0.5)
        assert any(c[1].get("p_days") == 30 for c in called("admin_overview")), called("admin_overview")
        print("overview ok")

        # People
        pg.get_by_test_id("tab-people").click()
        pg.get_by_test_id("person-row").first.wait_for()
        assert pg.get_by_test_id("person-row").count() == 3 and pg.get_by_test_id("people-total").inner_text() == "3"
        pg.get_by_test_id("people-search").fill("aishath"); time.sleep(0.8)
        assert pg.get_by_test_id("person-row").count() == 1
        pg.get_by_test_id("people-search").fill("")
        pg.get_by_test_id("filter-opted_in").click(); time.sleep(0.6)
        assert pg.get_by_test_id("person-row").count() == 2
        pg.get_by_test_id("filter-all").click(); time.sleep(0.6)
        pg.get_by_test_id("person-row").nth(1).click()
        d = pg.get_by_test_id("person-detail"); d.wait_for()
        assert "aishath@example.mv" in d.inner_text() and "not opted in" in d.inner_text()
        assert "Started a font (photo)" in d.inner_text() and "Downloaded .ttf (38 letters)" in d.inner_text(), d.inner_text()
        pg.get_by_test_id("tag-input").fill("beta"); pg.get_by_test_id("tag-input").press("Enter")
        pg.get_by_test_id("note-input").fill("wants a book font")
        pg.get_by_test_id("note-save").click(); pg.get_by_role("status").filter(has_text="Saved").wait_for()
        saved = called("admin_set_note")[-1][1]
        assert saved == {"p_id": OTHER, "p_note": "wants a book font", "p_tags": ["beta"]}, saved
        with pg.expect_download() as dl: pg.get_by_test_id("people-csv").click()
        csv = open(dl.value.path()).read()
        assert csv.splitlines()[0].startswith("email,joined,last_seen") and "niyaz@example.mv" in csv
        print("people ok")

        # Emails
        pg.get_by_test_id("tab-emails").click()
        pg.get_by_test_id("audience-count").filter(has_text="2 people").wait_for()
        assert pg.get_by_test_id("send-test").is_disabled() and pg.get_by_test_id("send-all").is_disabled()
        pg.get_by_test_id("subject").fill("Joined letters are here")
        pg.get_by_test_id("message").fill("You can now draw joined letters.\n\nOpen https://thaanafont.com to try them.")
        pg.get_by_test_id("send-test").click(); pg.get_by_test_id("send-result").filter(has_text="Test sent").wait_for()
        t = mails[-1]
        assert len(t) == 1 and t[0]["to"] == ["hshazil@gmail.com"] and t[0]["subject"] == "[Test] Joined letters are here", t
        assert not called("admin_log_email")
        pg.get_by_test_id("send-all").click()
        assert "Send to 2 people?" in pg.get_by_test_id("send-dialog").inner_text()
        assert len(mails) == 1                                  # nothing goes out before the confirm
        pg.get_by_test_id("confirm-send").click(); pg.get_by_test_id("send-result").filter(has_text="Sent to 2").wait_for()
        m = mails[-1]
        assert [x["to"][0] for x in m] == ["hshazil@gmail.com", "niyaz@example.mv"], m
        assert all(f"/unsubscribe?u={x_id}&t={TOKEN}" in x["html"] for x, x_id in zip(m, [ME, "44444444-4444-4444-8444-444444444444"]))
        assert all(x["headers"]["List-Unsubscribe"].startswith("<http") and x["reply_to"] == "hshazil@gmail.com" for x in m)
        assert m[0]["html"].count('<p style="margin:0 0 16px') == 2 and '>https://thaanafont.com</a>' in m[0]["html"], "two paragraphs and a link"
        assert "Unsubscribe:" in m[0]["text"]
        assert called("admin_log_email")[-1][1] == {"p_subject": "Joined letters are here", "p_body": "You can now draw joined letters.\n\nOpen https://thaanafont.com to try them.", "p_audience": "all", "p_count": 2}
        assert "Welcome to the beta" in pg.get_by_test_id("sent-table").inner_text()
        print("emails ok")

        # a non-admin cannot use the send route
        pg2 = page_as("other-token", "aishath@example.mv", OTHER)
        pg2.goto(f"{WEB}/admin")
        r = pg2.request.post(f"{WEB}/api/admin/send", headers={"Authorization": "Bearer other-token"}, data={"subject": "x", "message": "y", "mode": "all"})
        assert r.status == 403, r.status
        r = pg2.request.post(f"{WEB}/api/admin/send", data={"subject": "x", "message": "y"})
        assert r.status == 401, r.status
        pg2.context.close()

        # Sales
        pg.get_by_test_id("tab-sales").click(); pg.get_by_test_id("sales-empty").wait_for()
        pg.context.close()

        # unsubscribe
        pg = page_as(None, None, None)
        pg.goto(f"{WEB}/unsubscribe?u={ME}&t={TOKEN}"); pg.get_by_test_id("unsub-button").click()
        pg.get_by_test_id("unsub-message").filter(has_text="You are unsubscribed").wait_for()
        assert called("unsubscribe")[-1][1] == {"p_id": ME, "p_token": TOKEN}
        pg.goto(f"{WEB}/unsubscribe"); pg.get_by_test_id("unsub-message").filter(has_text="not complete").wait_for()
        pg.goto(f"{WEB}/unsubscribe?u={ME}&t={ME}"); pg.get_by_test_id("unsub-button").click()
        pg.get_by_test_id("unsub-message").filter(has_text="did not work").wait_for()
        print("unsubscribe ok")
        b.close()
    srv.shutdown()
    print("admin flow ok")


if __name__ == "__main__":
    main()
