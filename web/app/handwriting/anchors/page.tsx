import type { Metadata } from "next";
import { AnchorsClient } from "@/components/AnchorsClient";

export const metadata: Metadata = { title: "Place the vowel marks · MyAkuru" };

export default function AnchorsPage() {
  return <AnchorsClient />;
}
