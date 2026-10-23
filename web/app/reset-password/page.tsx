import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const metadata: Metadata = { title: "New password · ThaanaFont" };

export default function ResetPasswordPage() {
  return (
    <AuthShell other={{ href: "/login", label: "Log in" }}>
      <ResetPasswordForm />
    </AuthShell>
  );
}
