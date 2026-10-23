import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { SITE, WELCOME_SUBJECT, welcomeHtml, welcomeText } from "@/lib/email/welcome";

export const runtime = "nodejs";

const FROM = "ThaanaFont <noreply@thaanafont.com>";
const FRESH_MS = 60 * 60 * 1000;   // only accounts made in the last hour get a welcome

/**
 * Sends the welcome email to whoever is signed in, once.
 * The caller sends their own session token; the address comes from that token, never from the request body.
 */
export async function POST(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, key = process.env.RESEND_API_KEY;
  if (!token || !url || !anon) return NextResponse.json({ sent: false }, { status: 401 });
  if (!key) return NextResponse.json({ sent: false, reason: "email not set up" });

  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.email) return NextResponse.json({ sent: false }, { status: 401 });
  if (user.user_metadata?.welcomed) return NextResponse.json({ sent: false, reason: "already sent" });
  if (Date.now() - new Date(user.created_at).getTime() > FRESH_MS) return NextResponse.json({ sent: false, reason: "not a new account" });

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `welcome-${user.id}` },
      body: JSON.stringify({ from: FROM, to: [user.email], subject: WELCOME_SUBJECT, html: welcomeHtml(SITE), text: welcomeText(SITE) }),
    });
    if (!r.ok) return NextResponse.json({ sent: false, reason: "send failed" }, { status: 502 });
    return NextResponse.json({ sent: true });
  } catch {
    return NextResponse.json({ sent: false, reason: "send failed" }, { status: 502 });
  }
}
