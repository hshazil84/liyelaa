import Link from "next/link";

export type Step = { label: string; href?: string };

/** Done steps get a check, the current step a dark pill, later steps an outline. */
export function Stepper({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <ol aria-label="Steps" className="flex flex-wrap gap-1">
      {steps.map((s, i) => {
        const done = i < current;
        const now = i === current;
        const inner = (
          <>
            <span
              className={[
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                done ? "bg-teal" : now ? "bg-white text-ink" : "box-border border-[1.5px] border-[#BDCFC2]",
              ].join(" ")}
            >
              {done ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2.5 6.5l2.2 2.2 4.8-5" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            {s.label}
          </>
        );
        const cls = [
          "flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-medium",
          now ? "bg-ink text-white" : done ? "text-teal" : "text-muted",
        ].join(" ");
        return (
          <li key={s.label} aria-current={now ? "step" : undefined}>
            {done && s.href ? (
              <Link href={s.href} className={cls}>{inner}</Link>
            ) : (
              <span className={cls}>{inner}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
