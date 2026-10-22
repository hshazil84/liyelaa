import type { Metadata } from "next";
import { TailsClient } from "@/components/TailsClient";

export const metadata: Metadata = { title: "Cursive tails · MyAkuru" };

export default function TailsPage() {
  return <TailsClient />;
}
