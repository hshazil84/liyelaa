"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HowArt, HOW_STEPS } from "@/components/HowArt";
import { useAuth } from "@/lib/auth";

export const INTRO_EVENT = "thaanafont-intro";
const SEEN_KEY = "thaanafont.intro-seen";

function seen(): boolean { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } }
function markSeen() { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* shown again next time, no harm */ } }

/** How it works as a pop-up: opens on a first visit to people who are signed out, and from the "How it works" link. */
export function IntroModal() {
  const { ready, user, enabled } = useAuth();
  const [open, setOpen] = useState(false);
  const main = useRef<HTMLElement | null>(null);

  const close = useCallback(() => { markSeen(); setOpen(false); }, []);

  useEffect(() => {
    if (enabled && ready && !user && !seen()) setOpen(true);
  }, [enabled, ready, user]);

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(INTRO_EVENT, on);
    return () => window.removeEventListener(INTRO_EVENT, on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => main.current?.focus(), 30);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); window.clearTimeout(t); };
  }, [open, close]);

  if (!open) return null;
  const signedIn = Boolean(user);
  const showSignUp = enabled && !signedIn;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 px-4 py-6 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} data-testid="intro-scrim">
      <div role="dialog" aria-modal="true" aria-labelledby="intro-title" data-testid="intro-modal" className="relative flex w-full max-w-[520px] flex-col gap-5 rounded-[22px] bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.25)] sm:p-6">
        <button type="button" onClick={close} aria-label="Close" data-testid="intro-close" className="absolute right-2.5 top-2.5 grid h-11 w-11 place-items-center rounded-full text-2xl text-muted hover:bg-paper">×</button>
        <h2 id="intro-title" className="pr-10 font-display text-2xl font-bold leading-tight">Make a Thaana font in three steps</h2>
        <ol className="flex flex-col gap-3.5">
          {HOW_STEPS.map((s) => (
            <li key={s.n} className="flex items-center gap-3.5">
              <span className="w-24 shrink-0 overflow-hidden rounded-xl bg-paper"><HowArt step={s.n} /></span>
              <p className="min-w-0 text-sm leading-snug text-muted"><b className="block text-[15px] text-ink">{s.n}. {s.title}</b>{s.short}</p>
            </li>
          ))}
        </ol>
        <div className="flex flex-col items-center gap-1">
          {showSignUp ? (
            <>
              <Link ref={main as React.Ref<HTMLAnchorElement>} href="/signup" onClick={markSeen} data-testid="intro-signup" className="inline-flex h-[52px] w-full items-center justify-center rounded-[14px] bg-teal text-base font-bold text-white hover:bg-teal-dark">
                Sign up free to start
              </Link>
              <Link href="/login" onClick={markSeen} data-testid="intro-login" className="inline-flex min-h-11 items-center px-3 text-sm font-bold hover:underline">I already have an account</Link>
            </>
          ) : (
            <button ref={main as React.Ref<HTMLButtonElement>} type="button" onClick={close} data-testid="intro-ok" className="inline-flex h-[52px] w-full items-center justify-center rounded-[14px] bg-teal text-base font-bold text-white hover:bg-teal-dark">
              Got it
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
