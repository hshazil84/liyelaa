import type { Metadata } from "next";
import { LigaturesClient } from "@/components/LigaturesClient";

export const metadata: Metadata = { title: "Joined letters · MyAkuru" };

export default function LigaturesPage() {
  return <LigaturesClient />;
}
