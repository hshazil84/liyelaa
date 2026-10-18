import type { Metadata } from "next";
import { HandwritingPhoto } from "@/components/HandwritingPhoto";

export const metadata: Metadata = { title: "Handwriting · Dhivehi Font Maker" };

export default function HandwritingPage() {
  return <HandwritingPhoto />;
}
