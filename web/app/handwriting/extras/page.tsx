import type { Metadata } from "next";
import { ExtrasClient } from "@/components/ExtrasClient";

export const metadata: Metadata = { title: "Signs and punctuation · ThaanaFont" };

export default function ExtrasPage() {
  return <ExtrasClient />;
}
