"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

/** Counts one visit per browser tab session, however many pages are opened. */
export function VisitPing() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("thaanafont-visit")) return;
      sessionStorage.setItem("thaanafont-visit", "1");
    } catch { /* storage blocked: count it once per page load */ }
    track("visit");
  }, []);
  return null;
}
