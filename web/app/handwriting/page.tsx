import type { Metadata } from "next";
import { HandwritingPhoto } from "@/components/HandwritingPhoto";

export const metadata: Metadata = { title: "Handwriting · ThaanaFont" };

export default function HandwritingPage() {
  return <HandwritingPhoto />;
}
