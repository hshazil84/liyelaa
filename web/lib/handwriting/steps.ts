import type { Step } from "@/components/Stepper";

/** The handwriting path. Index = position in the stepper. */
export const HANDWRITING_STEPS: Step[] = [
  { label: "Start", href: "/" },
  { label: "Photo", href: "/handwriting" },
  { label: "Clean up", href: "/handwriting/letters" },
  { label: "Level" },
  { label: "Anchors" },
  { label: "Spacing and extras" },
  { label: "Test and export" },
];
