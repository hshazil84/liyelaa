import type { Metadata } from "next";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource-variable/dm-sans";
import "./globals.css";
import { AccountMenu } from "@/components/AccountMenu";
import { VisitPing } from "@/components/VisitPing";

export const metadata: Metadata = {
  title: "ThaanaFont",
  description: "Make a Dhivehi (Thaana) font from your handwriting, or restyle an open one.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="pb-20">
        {children}
        <AccountMenu />
        <VisitPing />
      </body>
    </html>
  );
}
