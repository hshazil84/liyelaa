import type { Metadata } from "next";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource-variable/dm-sans";
import "./globals.css";
import { Feedback } from "@/components/Feedback";

export const metadata: Metadata = {
  title: "MyAkuru",
  description: "Make a Dhivehi (Thaana) font from your handwriting, or restyle an open one.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Feedback />
      </body>
    </html>
  );
}
