import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AccountMenu } from "@/components/AccountMenu";
import { VisitPing } from "@/components/VisitPing";
import { WarmLoader } from "@/components/WarmLoader";

// Self-hosted and preloaded, with a fallback sized to match, so the page does not jump when the fonts arrive.
const hanken = localFont({
  src: "../node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-hanken",
  display: "swap",
});
const dmSans = localFont({
  src: "../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
  weight: "100 1000",
  variable: "--font-dmsans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ThaanaFont",
  description: "Make a Dhivehi (Thaana) font from your handwriting, or restyle an open one.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hanken.variable} ${dmSans.variable}`}>
      <head>
        {/* The Thaana font is used on almost every screen, so it starts loading with the page. */}
        <link rel="preload" href="/fonts/AKRasmee-2.0.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="pb-20">
        {children}
        <AccountMenu />
        <VisitPing />
        <WarmLoader />
      </body>
    </html>
  );
}
