"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { rpc } from "@/lib/admin";
import { FEEDBACK_EMAIL } from "@/lib/site";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The link in an update email lands here. One tap on the button turns updates off for that account. */
export function UnsubscribeClient() {
  const params = useSearchParams();
  const u = params.get("u") ?? "", t = params.get("t") ?? "";
  const valid = UUID.test(u) && UUID.test(t);
  const [state, setState] = useState<"ask" | "busy" | "done" | "fail">("ask");

  async function go() {
    setState("busy");
    try { setState((await rpc<boolean>("unsubscribe", { p_id: u, p_token: t })) ? "done" : "fail"); } catch { setState("fail"); }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      {!valid ? (
        <p data-testid="unsub-message" className="max-w-[44ch] text-base">This link is not complete. Open it from the email, or write to {FEEDBACK_EMAIL} and we will take you off the list.</p>
      ) : state === "done" ? (
        <p data-testid="unsub-message" className="max-w-[44ch] text-base font-medium">You are unsubscribed. You will still get emails about your account, like a password reset.</p>
      ) : state === "fail" ? (
        <p data-testid="unsub-message" className="max-w-[44ch] text-base">That did not work. Write to {FEEDBACK_EMAIL} and we will take you off the list.</p>
      ) : (
        <>
          <p className="max-w-[44ch] text-base">Stop getting ThaanaFont update emails?</p>
          <button type="button" data-testid="unsub-button" disabled={state === "busy"} onClick={() => void go()} className="h-12 rounded-xl bg-teal px-6 text-base font-bold text-white hover:bg-teal-dark">Unsubscribe</button>
        </>
      )}
      <Link href="/" className="text-sm font-bold underline underline-offset-4">Back to ThaanaFont</Link>
    </div>
  );
}
