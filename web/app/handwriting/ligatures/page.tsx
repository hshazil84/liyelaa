import type { Metadata } from "next";
import { LigaturesClient } from "@/components/LigaturesClient";

export const metadata: Metadata = { title: "Joined letters · ThaanaFont" };

export default function LigaturesPage() {
  return <LigaturesClient />;
}
