"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

/** Only shown to people who are not signed in. */
export function SignUpCta() {
  const { ready, user, enabled } = useAuth();
  if (!enabled || !ready || user) return null;
  return (
    <div>
      <Link href="/signup" data-testid="cta-signup" className="inline-flex h-12 items-center justify-center rounded-2xl bg-teal px-6 text-base font-bold text-white hover:bg-teal-dark">
        Sign up free to start
      </Link>
    </div>
  );
}
