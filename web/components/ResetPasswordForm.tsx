"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AUTH_ON } from "@/lib/supabase";
import { openRecoveryLink, setNewPassword } from "@/lib/auth";

const field = "min-h-12 rounded-xl border-[1.5px] border-[#BDCFC2] bg-white px-3.5 text-base font-normal text-ink placeholder:text-edge";

/** The page the reset link opens: pick a new password. */
export function ResetPasswordForm() {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "bad">("checking");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { openRecoveryLink().then((r) => setState(r === "ready" ? "ready" : "bad")); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Use a password with at least 8 characters.");
    setBusy(true);
    const r = await setNewPassword(password);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.replace("/");
  }

  if (!AUTH_ON) return <p className="rounded-xl bg-white p-4 text-base text-muted">Sign-in is not switched on yet.</p>;
  if (state === "checking") return <p className="text-base text-muted" role="status">One moment…</p>;
  if (state === "bad") {
    return (
      <div className="flex w-full max-w-[420px] flex-col gap-4" data-testid="reset-bad">
        <h1 className="font-display text-[28px] font-bold leading-tight">That link has expired</h1>
        <p className="text-base text-muted">Reset links work once and stop after an hour. Ask for a new one.</p>
        <Link href="/forgot-password" className="inline-flex h-[52px] items-center justify-center rounded-[14px] bg-teal text-base font-bold text-white hover:bg-teal-dark">Send a new link</Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="flex w-full max-w-[420px] flex-col gap-4" data-testid="reset-form">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold leading-tight">Choose a new password</h1>
        <p className="text-base text-muted">You will be logged in once it is saved.</p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        New password
        <input className={field} type="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="reset-password" />
      </label>
      {error && <p role="alert" data-testid="auth-error" className="rounded-xl bg-coral-soft px-3.5 py-2.5 text-sm font-medium text-plum">{error}</p>}
      <button type="submit" disabled={busy} data-testid="reset-submit" className="inline-flex h-[52px] items-center justify-center rounded-[14px] bg-teal text-base font-bold text-white hover:bg-teal-dark disabled:opacity-60">
        {busy ? "One moment…" : "Save new password"}
      </button>
    </form>
  );
}
