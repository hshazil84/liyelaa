"use client";

import { useEffect, useState } from "react";
import type { Step } from "@/components/Stepper";
import { loadProject } from "./store";

const REST: Step[] = [
  { label: "Level", href: "/handwriting/level" },
  { label: "Tails", href: "/handwriting/tails" },
  { label: "Anchors", href: "/handwriting/anchors" },
  { label: "Spacing and extras", href: "/handwriting/spacing" },
  { label: "Test and export", href: "/handwriting/export" },
];

/** The handwriting path. Index = position in the stepper. */
export const HANDWRITING_STEPS: Step[] = [
  { label: "Start", href: "/" },
  { label: "Photo", href: "/handwriting" },
  { label: "Clean up", href: "/handwriting/letters" },
  ...REST,
];

/** The draw or import path shares every step after the first. */
export const DRAW_STEPS: Step[] = [
  { label: "Start", href: "/" },
  { label: "Draw or import", href: "/draw" },
  { label: "Clean up", href: "/handwriting/letters" },
  ...REST,
];

export type PathKind = "photo" | "draw";
export const stepsFor = (path?: PathKind): Step[] => (path === "draw" ? DRAW_STEPS : HANDWRITING_STEPS);

/** The steps for the path this project started on. */
export function useSteps(): Step[] {
  const [path, setPath] = useState<PathKind | undefined>(undefined);
  useEffect(() => { loadProject().then((p) => setPath(p.path)); }, []);
  return stepsFor(path);
}
