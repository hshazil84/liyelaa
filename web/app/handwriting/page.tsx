import type { Metadata } from "next";
import { HandwritingPhoto } from "@/components/HandwritingPhoto";

export const metadata: Metadata = { title: "Handwriting · MyAkuru" };

export default function HandwritingPage() {
  return <HandwritingPhoto />;
}
