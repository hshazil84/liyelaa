import type { Metadata } from "next";
import { SpacingClient } from "@/components/SpacingClient";

export const metadata: Metadata = { title: "Space the letters · MyAkuru" };

export default function SpacingPage() {
  return <SpacingClient />;
}
