import type { Metadata } from "next";
import { FontsClient } from "@/components/FontsClient";

export const metadata: Metadata = { title: "My fonts · MyAkuru" };

export default function FontsPage() {
  return <FontsClient />;
}
