import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/AuthShell";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Log in · ThaanaFont" };

export default function LogInPage() {
  return (
    <AuthShell other={{ href: "/signup", label: "Sign up" }}>
      <Suspense fallback={null}><AuthForm mode="login" /></Suspense>
    </AuthShell>
  );
}
