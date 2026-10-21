import type { Metadata } from "next";
import { ExtrasClient } from "@/components/ExtrasClient";

export const metadata: Metadata = { title: "Signs and punctuation · MyAkuru" };

export default function ExtrasPage() {
  return <ExtrasClient />;
}
