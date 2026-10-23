import { keyFor } from "@/lib/handwriting/keys";

const cap = "inline-flex font-sans h-6 min-w-6 items-center justify-center rounded-md border border-[#BDCFC2] bg-[#F3F9F5] px-1.5 text-[12px] font-bold text-ink";

/** The key that types this character on the Thaana keyboard, shown like  ⇧ F. */
export function KeyHint({ cp }: { cp: number }) {
  const k = keyFor(cp);
  if (!k) return null;
  return (
    <span className="inline-flex items-center gap-1" data-testid="key-hint" title={`On the Thaana keyboard: ${k.shift ? "Shift + " : ""}${k.key}`}>
      <span className="sr-only">Keyboard: </span>
      {k.shift && <><kbd className={cap}>Shift</kbd><span aria-hidden className="text-xs text-muted">+</span></>}
      <kbd className={cap}>{k.key}</kbd>
    </span>
  );
}
