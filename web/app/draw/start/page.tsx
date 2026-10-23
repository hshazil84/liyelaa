import type { Metadata } from "next";
import { DrawStart } from "@/components/DrawStart";

export const metadata: Metadata = { title: "Draw · ThaanaFont" };

export default function DrawStartPage() {
  return <DrawStart />;
}
