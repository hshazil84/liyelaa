"use client";

import { useEffect, useRef } from "react";

/**
 * The designer animation with a line of words under it. The animation loads after the words,
 * so a slow connection still sees the text at once. With reduced motion it stays on one still frame.
 */
export function Loading({ label, size = 220 }: { label: string; size?: number }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    let anim: { destroy: () => void } | null = null;
    (async () => {
      try {
        const [{ default: lottie }, data] = await Promise.all([
          import("lottie-web/build/player/lottie_light"),
          fetch("/lottie/designer.json").then((r) => r.json()),
        ]);
        if (dead || !box.current) return;
        const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const a = lottie.loadAnimation({ container: box.current, renderer: "svg", loop: true, autoplay: !still, animationData: data });
        if (still) a.goToAndStop(300, true);
        anim = a;
      } catch {
        // words alone are fine
      }
    })();
    return () => { dead = true; anim?.destroy(); };
  }, []);

  return (
    <div className="flex flex-col items-center gap-2 text-center" role="status">
      <div ref={box} aria-hidden style={{ width: size, height: size, maxWidth: "70vw", maxHeight: "70vw" }} />
      <p className="text-base text-muted">{label}</p>
    </div>
  );
}
