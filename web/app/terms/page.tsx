import type { Metadata } from "next";
import { Clause, LegalShell } from "@/components/LegalShell";
import { FEEDBACK_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Terms · ThaanaFont" };

export default function TermsPage() {
  return (
    <LegalShell title="Terms">
      <Clause title="1. What this is"><p>ThaanaFont is a tool for making Thaana fonts. It is in beta, which means it can break, change, or be switched off.</p></Clause>
      <Clause title="2. Your account"><p>Sign up with your own email and keep your password to yourself. You are responsible for what happens under your account.</p></Clause>
      <Clause title="3. Your work"><p>Your handwriting, drawings and the fonts you make are yours. We do not claim any rights to them. Only upload or draw things you have the right to use.</p></Clause>
      <Clause title="4. Saving your work"><p>Your letters and projects are saved in your browser, not on our servers. If you clear your browser data, they are gone. Save project files to keep copies.</p></Clause>
      <Clause title="5. Price"><p>ThaanaFont is free during the beta. If we start charging for downloads, we will tell you first, and what you already downloaded stays yours.</p></Clause>
      <Clause title="6. No promises"><p>We give you the tool as it is. We are not responsible for lost work or for fonts that do not turn out as you hoped.</p></Clause>
      <Clause title="7. Closing an account"><p>You can ask us to delete your account at any time. We may close accounts that misuse the site.</p></Clause>
      <Clause title="8. Changes and contact"><p>We may update these terms. The date at the top shows the latest version. Questions: {FEEDBACK_EMAIL}.</p></Clause>
    </LegalShell>
  );
}
