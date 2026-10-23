import Link from "next/link";

const TABS = [
  { id: "spacing", label: "Letter spacing", href: "/handwriting/spacing" },
  { id: "symbols", label: "Signs and punctuation", href: "/handwriting/extras" },
  { id: "ligatures", label: "Joined letters", href: "/handwriting/ligatures" },
] as const;

export type ExtrasTab = (typeof TABS)[number]["id"];

/** The three parts of the "Spacing and extras" step. Each is optional, so every one can be skipped. */
export function ExtrasNav({ current }: { current: ExtrasTab }) {
  return (
    <nav aria-label="Spacing and extras" className="mx-auto flex w-full max-w-[1280px] flex-wrap gap-1 px-4 sm:px-10 pt-6 text-sm font-medium">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === current ? "page" : undefined}
          className={`rounded-full px-4 py-2 ${t.id === current ? "bg-ink text-white" : "border border-line bg-white text-muted hover:bg-paper"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
