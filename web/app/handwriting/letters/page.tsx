import type { Metadata } from "next";
import { LettersClient } from "@/components/LettersClient";

export const metadata: Metadata = { title: "Clean up your letters · MyAkuru" };

export default function LettersPage() {
  return <LettersClient />;
}
