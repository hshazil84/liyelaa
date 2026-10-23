import type { Metadata } from "next";
import { Clause, LegalShell } from "@/components/LegalShell";
import { FEEDBACK_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy note · ThaanaFont" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy note">
      <Clause title="What we keep"><ul><li>Your email address and password. The password is stored scrambled, so we cannot read it.</li></ul></Clause>
      <Clause title="What stays in your browser"><p>Your photos, letters and projects. Photos are never uploaded.</p></Clause>
      <Clause title="What we receive when you download"><p>The letter shapes and the font details you typed, sent to our server so it can build the font file. We do not keep them.</p></Clause>
      <Clause title="Who helps us run this"><p>We use outside services to run ThaanaFont: one for sign-in, one to host the website, and one to build the font files. They only get what they need to do that job.</p></Clause>
      <Clause title="How the site is used"><p>We count simple things, such as visits, fonts started and downloads, so we can see what works. If you are signed in the count is tied to your account. We never record your letters, photos or font files this way.</p></Clause>
      <Clause title="Cookies and tracking"><p>Your browser keeps you signed in. No ads and no advertising trackers. We do not sell your data.</p></Clause>
      <Clause title="Feedback"><p>If you email us, we keep your message and your address so we can reply.</p></Clause>
      <Clause title="Deleting your data"><p>Email {FEEDBACK_EMAIL} and we will delete your account.</p></Clause>
    </LegalShell>
  );
}
