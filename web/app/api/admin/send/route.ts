import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { updateHtml, updateText, unsubscribeUrl } from "@/lib/email/update";
import { SITE } from "@/lib/email/welcome";
import { FEEDBACK_EMAIL } from "@/lib/site";

export const runtime = "nodejs";

const RESEND = (process.env.RESEND_API_URL || "https://api.resend.com").replace(/\/$/, "");   // the override is for tests
const FROM = "ThaanaFont <noreply@thaanafont.com>";
const FILTERS = ["all", "no_download", "downloaded", "inactive"];
const CHUNK = 100;   // Resend takes up to 100 emails in one batch

type Row = { id: string; email: string; token: string };

/**
 * Sends an update email. Only for admins: the caller's own session token is used for every database call,
 * so the database itself decides who is an admin. A test goes only to the admin's own address.
 */
export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, key = process.env.RESEND_API_KEY;
  if (!token || !url || !anon) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!key) return NextResponse.json({ error: "Email is not set up on the server." }, { status: 503 });

  let body: { subject?: string; message?: string; filter?: string; mode?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const subject = (body.subject ?? "").trim(), message = (body.message ?? "").trim();
  const filter = body.filter && FILTERS.includes(body.filter) ? body.filter : "all";
  const test = body.mode === "test";
  if (!subject || subject.length > 150 || !message || message.length > 10000) return NextResponse.json({ error: "Add a subject (up to 150 letters) and a message (up to 10,000)." }, { status: 400 });

  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who } = await sb.auth.getUser(token);
  const me = who?.user;
  if (!me?.email) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: isAdmin } = await sb.rpc("is_admin");
  if (isAdmin !== true) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  let rows: Row[];
  if (test) {
    rows = [{ id: me.id, email: me.email, token: "00000000-0000-0000-0000-000000000000" }];
  } else {
    const { data, error } = await sb.rpc("admin_audience", { p_filter: filter });
    if (error) return NextResponse.json({ error: "Could not read the list." }, { status: 502 });
    rows = (data as { rows: Row[] }).rows;
  }
  if (rows.length === 0) return NextResponse.json({ error: "No one to send to." }, { status: 400 });

  const sendId = crypto.randomUUID();
  let sent = 0, failed = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const batch = part.map((r) => {
      const u = test ? `${SITE}/unsubscribe` : unsubscribeUrl(r.id, r.token);
      return {
        from: FROM, to: [r.email], reply_to: FEEDBACK_EMAIL,
        subject: test ? `[Test] ${subject}` : subject,
        html: updateHtml(subject, message, u), text: updateText(subject, message, u),
        headers: { "List-Unsubscribe": `<${u}>` },
      };
    });
    try {
      const r = await fetch(`${RESEND}/emails/batch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `update-${sendId}-${i / CHUNK}` },
        body: JSON.stringify(batch),
      });
      if (r.ok) sent += part.length; else failed += part.length;
    } catch { failed += part.length; }
  }

  if (!test && sent > 0) await sb.rpc("admin_log_email", { p_subject: subject, p_body: message, p_audience: filter, p_count: sent });
  return NextResponse.json({ sent, failed, test });
}
