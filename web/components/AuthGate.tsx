"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/** The tools need an account. Signed-out visitors are sent to sign up and come back to the page they wanted. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, user, enabled } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const blocked = enabled && ready && !user;
  useEffect(() => {
    if (blocked) router.replace(`/signup?next=${encodeURIComponent(path || "/")}`);
  }, [blocked, router, path]);
  if (!enabled) return <>{children}</>;
  if (!ready || blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" data-testid="auth-wait">
        <p className="text-base text-muted">{blocked ? "Taking you to sign up…" : "Loading…"}</p>
      </div>
    );
  }
  return <>{children}</>;
}
