import type { Metadata } from "next";
import { AnchorsClient } from "@/components/AnchorsClient";

export const metadata: Metadata = { title: "Place the vowel marks · Dhivehi Font Maker" };

export default function AnchorsPage() {
  return <AnchorsClient />;
}
