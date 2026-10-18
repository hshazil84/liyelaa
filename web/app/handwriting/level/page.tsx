import type { Metadata } from "next";
import { LevelClient } from "@/components/LevelClient";

export const metadata: Metadata = { title: "Level your letters · Dhivehi Font Maker" };

export default function LevelPage() {
  return <LevelClient />;
}
