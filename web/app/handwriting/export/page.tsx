import type { Metadata } from "next";
import { ExportClient } from "@/components/ExportClient";

export const metadata: Metadata = { title: "Test and export · Dhivehi Font Maker" };

export default function ExportPage() {
  return <ExportClient />;
}
