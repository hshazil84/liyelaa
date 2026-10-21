import type { Metadata } from "next";
import { ExportClient } from "@/components/ExportClient";

export const metadata: Metadata = { title: "Test and export · MyAkuru" };

export default function ExportPage() {
  return <ExportClient />;
}
