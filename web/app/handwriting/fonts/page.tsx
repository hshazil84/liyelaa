import type { Metadata } from "next";
import { FontsClient } from "@/components/FontsClient";

export const metadata: Metadata = { title: "My fonts · ThaanaFont" };

export default function FontsPage() {
  return <FontsClient />;
}
