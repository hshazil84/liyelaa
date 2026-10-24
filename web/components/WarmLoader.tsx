"use client";

import { useEffect } from "react";
import { warmDesigner } from "@/lib/lottie/load";

/** Fetches the waiting animation in the background, so it shows at once instead of after the wait has started. */
export function WarmLoader() {
  useEffect(() => { warmDesigner(); }, []);
  return null;
}
