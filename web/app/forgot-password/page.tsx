import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Reset your password · ThaanaFont" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell other={{ href: "/login", label: "Log in" }}>
      <Suspense fallback={null}><AuthForm mode="forgot" /></Suspense>
    </AuthShell>
  );
}
