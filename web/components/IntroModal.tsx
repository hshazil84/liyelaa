"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HowArt, HOW_STEPS } from "@/components/HowArt";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/lib/auth";

export const INTRO_EVENT = "thaanafont-intro";
const SEEN_KEY = "thaanafont.intro-seen";

function seen(): boolean { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } }
function markSeen() { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* shown again next time, no harm */ } }

/** How it works as a pop-up: opens on a first visit to people who are signed out, and from the "How it works" link. One step at a time, swipe or Next. */
export function IntroModal() {
  const { ready, user, enabled } = useAuth();
  const [open, setOpen] = useState(false);
  const main = useRef<HTMLElement | null>(null);
  const track = useRef<HTMLOListElement>(null);
  const [at, setAt] = useState(0);
  const last = HOW_STEPS.length - 1;

  const go = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const n = Math.max(0, Math.min(last, i));
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: n * el.clientWidth, behavior: calm ? "auto" : "smooth" });
    setAt(n);
  }, [last]);

  const close = useCallback(() => { markSeen(); setOpen(false); setAt(0); }, []);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(at + 1);
      else if (e.key === "ArrowLeft") go(at - 1);
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => main.current?.focus(), 30);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); window.clearTimeout(t); };
  }, [open, close, go, at]);

  if (!open) return null;
  const signedIn = Boolean(user);
  const showSignUp = enabled && !signedIn;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 px-4 py-6 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} data-testid="intro-scrim">
      <div role="dialog" aria-modal="true" aria-labelledby="intro-title" data-testid="intro-modal" className="relative flex w-full max-w-[520px] flex-col gap-5 rounded-[22px] bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.25)] sm:p-6">
        <button type="button" onClick={close} aria-label="Close" data-testid="intro-close" className="absolute right-2.5 top-2.5 grid h-11 w-11 place-items-center rounded-full text-2xl text-muted hover:bg-paper">×</button>
        <div className="flex items-center justify-between pr-10">
          <h2 id="intro-title" className="text-sm font-bold uppercase tracking-[.06em] text-muted" data-testid="intro-count">Step {at + 1} of {HOW_STEPS.length}</h2>
        </div>
        <ol ref={track} data-testid="intro-track" onScroll={(e) => { const el = e.currentTarget; setAt(Math.round(el.scrollLeft / el.clientWidth)); }}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {HOW_STEPS.map((s, i) => (
            <li key={s.n} aria-hidden={i !== at} data-testid={`intro-step-${s.n}`} className="flex w-full shrink-0 snap-center flex-col gap-4">
              <div className="rounded-[18px] border border-line bg-paper p-3.5"><HowArt step={s.n} /></div>
              <p className="flex flex-col gap-1.5 px-1 text-base leading-snug text-muted"><b className="font-display text-[22px] leading-tight text-ink">{s.n}. {s.title}</b>{s.short}</p>
            </li>
          ))}
        </ol>
        <div className="flex justify-center gap-1.5" role="group" aria-label="Steps">
          {HOW_STEPS.map((s, i) => (
            <button key={s.n} type="button" onClick={() => go(i)} aria-label={`Step ${s.n}`} aria-current={i === at} data-testid={`intro-dot-${s.n}`} className="grid h-6 place-items-center px-0.5">
              <span className={`block h-2 rounded-full transition-all ${i === at ? "w-[22px] bg-ink" : "w-2 bg-[#BDCFC2]"}`} />
            </button>
          ))}
        </div>
        <div className="flex flex-col items-center gap-1">
          {at < last ? (
            <button ref={main as React.Ref<HTMLButtonElement>} type="button" onClick={() => go(at + 1)} data-testid="intro-next" className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-teal text-base font-bold text-white hover:bg-teal-dark">
              Next <Icon icon={ArrowRight02Icon} size={18} />
            </button>
          ) : showSignUp ? (
            <Link ref={main as React.Ref<HTMLAnchorElement>} href="/signup" onClick={markSeen} data-testid="intro-signup" className="inline-flex h-[52px] w-full items-center justify-center rounded-[14px] bg-teal text-base font-bold text-white hover:bg-teal-dark">
                Sign up free to start
              </Link>
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
