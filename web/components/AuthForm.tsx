"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AUTH_ON } from "@/lib/supabase";
import { logIn, safeNext, signUp, useAuth } from "@/lib/auth";

const field = "min-h-12 rounded-xl border-[1.5px] border-[#BDCFC2] bg-white px-3.5 text-base font-normal text-ink placeholder:text-edge";

/** Sign up and Log in share one form. */
export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { ready, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const signup = mode === "signup";
  const other = `${signup ? "/login" : "/signup"}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;

  useEffect(() => { if (ready && user) router.replace(next); }, [ready, user, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setNotice("");
    if (!email.trim()) return setError("Enter your email.");
    if (signup && password.length < 8) return setError("Use a password with at least 8 characters.");
    if (!signup && !password) return setError("Enter your password.");
    if (signup && !agree) return setError("Tick the box to agree to the Terms and Privacy note.");
    setBusy(true);
    const r = signup ? await signUp(email, password) : await logIn(email, password);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    if (r.needsConfirm) return setNotice("Check your email. Tap the link we sent, then log in.");
    router.replace(next);
  }

  if (!AUTH_ON) {
    return <p className="rounded-xl bg-white p-4 text-base text-muted" data-testid="auth-off">Sign-in is not switched on yet. You can use the tools without an account for now.</p>;
  }

  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-[420px] flex-col gap-4" data-testid={`${mode}-form`}>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold leading-tight">{signup ? "Sign up" : "Log in"}</h1>
        <p className="text-base text-muted">{signup ? "Free while we are in beta." : "Welcome back."}</p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Email
        <input className={field} type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="auth-email" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Password
        <input className={field} type="password" autoComplete={signup ? "new-password" : "current-password"} placeholder={signup ? "At least 8 characters" : ""} value={password} onChange={(e) => setPassword(e.target.value)} data-testid="auth-password" />
      </label>
      {signup && (
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="auth-agree" className="mt-0.5 h-5 w-5 shrink-0" />
          <span>I agree to the <Link href="/terms" target="_blank" className="font-bold underline">Terms</Link> and have read the <Link href="/privacy" target="_blank" className="font-bold underline">Privacy note</Link>.</span>
        </label>
      )}
      {error && <p role="alert" data-testid="auth-error" className="rounded-xl bg-coral-soft px-3.5 py-2.5 text-sm font-medium text-plum">{error}</p>}
      {notice && <p role="status" data-testid="auth-notice" className="rounded-xl bg-teal-soft px-3.5 py-2.5 text-sm font-medium">{notice}</p>}
      <button type="submit" disabled={busy} data-testid="auth-submit" className="inline-flex h-[52px] items-center justify-center rounded-[14px] bg-teal text-base font-bold text-white hover:bg-teal-dark disabled:opacity-60">
        {busy ? "One moment…" : signup ? "Create my account" : "Log in"}
      </button>
      <p className="text-center text-sm text-muted">
        {signup ? "Already have an account? " : "New here? "}
        <Link href={other} className="font-bold text-ink underline" data-testid="auth-switch">{signup ? "Log in" : "Sign up"}</Link>
      </p>
    </form>
  );
}
