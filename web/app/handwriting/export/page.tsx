import type { Metadata } from "next";
import { ExportClient } from "@/components/ExportClient";

export const metadata: Metadata = { title: "Test and export · ThaanaFont" };

export default function ExportPage() {
  return <ExportClient />;
}
