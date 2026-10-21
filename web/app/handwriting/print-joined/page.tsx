import type { Metadata } from "next";
import { JoinedSheet } from "@/components/JoinedSheet";

export const metadata: Metadata = { title: "Joined letters sheet · MyAkuru" };

export default function PrintJoinedPage() {
  return <JoinedSheet />;
}
