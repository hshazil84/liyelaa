"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loading } from "@/components/Loading";
import { Logo } from "@/components/Logo";
import { go } from "@/lib/handwriting/fonts";
import { createFont, isBlank, loadProject, setPath, sourceMix } from "@/lib/handwriting/store";

/**
 * Where "Draw my own" lands. Drawing gets a font of its own, so it never opens the one made from photos:
 * an empty font is used as it is, a font with only drawn letters carries on, and anything else is put aside and a blank one opened.
 */
export function DrawStart() {
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const p = await loadProject();
        if (isBlank(p)) await setPath("draw");
        else if (p.path === "draw" && sourceMix(p).photo === 0) { /* already a drawn font: carry on */ }
        else {
          // the path flag alone is not trusted: an older visit may have marked a photo font as drawn
          if (sourceMix(p).photo > 0 && p.path !== "photo") await setPath("photo");
          await createFont("Drawn letters", "draw");
        }
        go("/handwriting/letters");
      } catch {
        setFailed(true);
      }
    })();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white px-10 py-4"><Logo /></header>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center gap-4 px-6 text-center" data-testid="draw-start">
        {failed ? (
          <>
            <p className="font-display text-xl font-bold">This browser would not open a new font.</p>
            <Link href="/handwriting/letters" className="font-bold text-teal underline underline-offset-4">Open the letters anyway</Link>
          </>
        ) : (
          <Loading label="Opening a blank font…" />
        )}
      </main>
    </div>
  );
}
