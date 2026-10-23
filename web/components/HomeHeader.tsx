"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { INTRO_EVENT } from "@/components/IntroModal";
import { useAuth } from "@/lib/auth";

const quiet = "inline-flex min-h-10 items-center px-2.5 text-sm font-bold text-ink hover:underline";

export function HomeHeader() {
  const { ready, user, enabled } = useAuth();
  return (
    <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 sm:gap-8 sm:px-10 sm:py-4">
      <Logo />
      <div className="flex items-center gap-1 sm:gap-2">
        <button type="button" className={`${quiet} hidden sm:inline-flex`} data-testid="open-intro" onClick={() => window.dispatchEvent(new Event(INTRO_EVENT))}>How it works</button>
        {enabled && ready && !user && (
          <>
            <Link href="/login" className={quiet} data-testid="nav-login">Log in</Link>
            <Link href="/signup" className="inline-flex min-h-10 items-center rounded-xl bg-teal px-4 text-sm font-bold text-white hover:bg-teal-dark" data-testid="nav-signup">Sign up</Link>
          </>
        )}
      </div>
    </header>
  );
}
