import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Sign up · ThaanaFont" };

export default function SignUpPage() {
  return (
    <AuthShell other={{ href: "/login", label: "Log in" }}>
      <Suspense fallback={null}><AuthForm mode="signup" /></Suspense>
    </AuthShell>
  );
}
