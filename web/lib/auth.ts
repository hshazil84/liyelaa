"use client";

import { useEffect, useState } from "react";
import { AUTH_ON, supabase } from "@/lib/supabase";
import { track } from "@/lib/track";

export type Who = { email: string } | null;

/** Who is signed in. `ready` turns true once the saved session has been looked at. */
export function useAuth(): { ready: boolean; user: Who; enabled: boolean } {
  const [state, setState] = useState<{ ready: boolean; user: Who }>({ ready: !AUTH_ON, user: null });
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    let alive = true;
    const set = (email: string | undefined) => alive && setState({ ready: true, user: email ? { email } : null });
    sb.auth.getSession().then(({ data }) => set(data.session?.user.email)).catch(() => set(undefined));
    const { data } = sb.auth.onAuthStateChange((_e, session) => set(session?.user.email));
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  return { ...state, enabled: AUTH_ON };
}

export type AuthResult = { ok: true; needsConfirm?: boolean } | { ok: false; message: string };

/** Plain-words versions of the errors people will actually meet. */
export function friendly(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid login")) return "Wrong email or password.";
  if (m.includes("already registered") || m.includes("already been registered")) return "That email already has an account. Log in instead.";
  if (m.includes("password") && (m.includes("least") || m.includes("short") || m.includes("weak"))) return "Use a password with at least 8 characters.";
  if (m.includes("valid email") || m.includes("invalid email")) return "That email address does not look right.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many tries. Wait a minute and try again.";
  if (m.includes("not confirmed")) return "Confirm your email first. Check your inbox.";
  if (m.includes("fetch") || m.includes("network")) return "Could not reach the sign-in service. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const sb = supabase();
  if (!sb) return { ok: false, message: "Sign-in is not set up yet." };
  try {
    const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
    if (error) return { ok: false, message: friendly(error.message) };
    // An address that already has an account comes back with no identities and no error.
    if (data.user && data.user.identities && data.user.identities.length === 0) return { ok: false, message: friendly("already registered") };
    if (data.session) void sendWelcome(data.session.access_token);
    track("signup");
    return { ok: true, needsConfirm: !data.session };
  } catch (e) {
    return { ok: false, message: friendly(e instanceof Error ? e.message : "") };
  }
}

/** Asks the server to send the welcome email, then marks the account so it is not sent twice. Never blocks or fails a sign-up. */
async function sendWelcome(token: string): Promise<void> {
  try {
    const res = await fetch("/api/welcome", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json()) as { sent?: boolean };
    if (body.sent) await supabase()?.auth.updateUser({ data: { welcomed: true } });
  } catch { /* the welcome email is a nice extra, not part of signing up */ }
}

export async function logIn(email: string, password: string): Promise<AuthResult> {
  const sb = supabase();
  if (!sb) return { ok: false, message: "Sign-in is not set up yet." };
  try {
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, message: friendly(error.message) };
    track("login");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: friendly(e instanceof Error ? e.message : "") };
  }
}

/** Sends the reset link. Says the same thing whether or not the address has an account. */
export async function sendReset(email: string): Promise<AuthResult> {
  const sb = supabase();
  if (!sb) return { ok: false, message: "Sign-in is not set up yet." };
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    if (error) return { ok: false, message: friendly(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: friendly(e instanceof Error ? e.message : "") };
  }
}

/** The reset link brings the person back with a one-off session in the address. Pick it up, then clear it from the bar. */
export async function openRecoveryLink(): Promise<"ready" | "expired" | "none"> {
  const sb = supabase();
  if (!sb) return "none";
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (h.get("error")) return "expired";
  const access = h.get("access_token"), refresh = h.get("refresh_token");
  if (!access || !refresh || h.get("type") !== "recovery") {
    const { data } = await sb.auth.getSession();   // already opened once and then reloaded
    return data.session ? "ready" : "none";
  }
  const { error } = await sb.auth.setSession({ access_token: access, refresh_token: refresh });
  window.history.replaceState(null, "", window.location.pathname);
  return error ? "expired" : "ready";
}

export async function setNewPassword(password: string): Promise<AuthResult> {
  const sb = supabase();
  if (!sb) return { ok: false, message: "Sign-in is not set up yet." };
  try {
    const { error } = await sb.auth.updateUser({ password });
    if (error) return { ok: false, message: error.message.toLowerCase().includes("different") ? "Pick a password you have not used before." : friendly(error.message) };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: friendly(e instanceof Error ? e.message : "") };
  }
}

export async function logOut(): Promise<void> {
  try { await supabase()?.auth.signOut(); } catch { /* signed out locally either way */ }
}

/** Only ever send people back to a page on this site. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}
