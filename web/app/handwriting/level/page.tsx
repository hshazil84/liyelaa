import type { Metadata } from "next";
import { LevelClient } from "@/components/LevelClient";

export const metadata: Metadata = { title: "Level your letters · ThaanaFont" };

export default function LevelPage() {
  return <LevelClient />;
}
