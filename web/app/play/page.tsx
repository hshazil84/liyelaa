import type { Metadata } from "next";
import { PlayClient } from "@/components/PlayClient";

export const metadata: Metadata = { title: "Play with a font · ThaanaFont" };

export default function PlayPage() {
  return <PlayClient />;
}
