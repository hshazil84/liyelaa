"use client";

import { useEffect, useRef, useState } from "react";
import { FEEDBACK_EMAIL, FEEDBACK_SUBJECT } from "@/lib/site";

/** A small "Send feedback" button on every page while MyAkuru is in beta. */
export function Feedback() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function copy() {
    try { await navigator.clipboard.writeText(FEEDBACK_EMAIL); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  return (
    <div ref={box} className="fixed z-30 flex flex-col items-end gap-2" style={{ right: "max(16px, env(safe-area-inset-right, 0px))", bottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}>
      {open && (
        <div role="dialog" aria-label="Send feedback" data-testid="feedback-panel" className="flex w-[min(340px,calc(100vw-32px))] flex-col gap-2.5 rounded-2xl border border-line bg-white p-4 shadow-lg">
          <b className="font-display text-base">Tell us what happened</b>
          <span className="text-[13px] leading-snug text-muted">Something broke, something confused you, or you have an idea. Say which step you were on.</span>
          <a href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}`} data-testid="feedback-email" className="flex min-h-10 items-center justify-center rounded-xl bg-teal px-3 text-sm font-bold text-white hover:bg-teal-dark">Email {FEEDBACK_EMAIL}</a>
          <button type="button" onClick={() => void copy()} className="flex min-h-10 items-center justify-center rounded-xl border border-[#BDCFC2] px-3 text-sm font-bold hover:bg-paper">{copied ? "Copied" : "Copy the address"}</button>
        </div>
      )}
      <button type="button" aria-expanded={open} data-testid="feedback-open" onClick={() => setOpen((o) => !o)} aria-label="Send feedback" className="min-h-9 rounded-full border border-[#BDCFC2] bg-white/95 px-3 text-xs font-bold shadow hover:bg-paper sm:min-h-10 sm:px-4 sm:text-[13px]">
        <span className="sm:hidden">Feedback</span><span className="hidden sm:inline">Send feedback</span>
      </button>
    </div>
  );
}
