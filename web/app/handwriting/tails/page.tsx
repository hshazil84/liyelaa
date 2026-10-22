import type { Metadata } from "next";
import { TailsClient } from "@/components/TailsClient";

export const metadata: Metadata = { title: "Cursive tails · ThaanaFont" };

export default function TailsPage() {
  return <TailsClient />;
}
