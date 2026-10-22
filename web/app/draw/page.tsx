import type { Metadata } from "next";
import { ImportClient } from "@/components/ImportClient";

export const metadata: Metadata = { title: "Draw or import · ThaanaFont" };

export default function DrawPage() {
  return <ImportClient />;
}
