import Link from "next/link";

export type Step = { label: string; href?: string };

/** On a phone: one slim bar that opens to the full list, so the work gets the screen. */
function PhoneBar({ steps, current }: { steps: Step[]; current: number }) {
  const at = Math.min(Math.max(current, 0), steps.length - 1);
  const next = steps[at + 1]?.label;
  return (
    <details className="group w-full overflow-hidden rounded-2xl border border-[#BDCFC2] bg-white sm:hidden" data-testid="step-bar">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{at + 1}</span>
        <span className="min-w-0 flex-1 font-bold leading-tight">
          {steps[at].label}
          <small className="block text-xs font-medium text-muted">Step {at + 1} of {steps.length}{next ? ` · next: ${next}` : ""}</small>
        </span>
        <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#5D797B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform group-open:rotate-180"><path d="M3 5l4 4 4-4" /></svg>
      </summary>
      <div className="h-1 bg-line"><div className="h-1 bg-ink" style={{ width: `${((at + 1) / steps.length) * 100}%` }} /></div>
      <ol aria-label="All steps" className="flex flex-col gap-0.5 p-1.5">
        {steps.map((s, i) => {
          const done = i < at;
          const now = i === at;
          const cls = ["flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm", now ? "bg-paper font-bold" : done ? "text-teal" : "text-muted"].join(" ");
          const dot = (
            <span className={["flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-bold", done ? "bg-teal text-white" : now ? "bg-ink text-white" : "box-border border-[1.5px] border-[#BDCFC2]"].join(" ")}>
              {done ? "✓" : i + 1}
            </span>
          );
          return (
            <li key={s.label} aria-current={now ? "step" : undefined}>
              {done && s.href ? <Link href={s.href} className={cls}>{dot}{s.label}</Link> : <span className={cls}>{dot}{s.label}</span>}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

/** Done steps get a check, the current step a dark pill, later steps an outline. */
export function Stepper({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <>
    <PhoneBar steps={steps} current={current} />
    <ol aria-label="Steps" className="hidden flex-wrap gap-1 sm:flex">
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
          now ? "bg-ink text-white" : done ? "text-teal hover:bg-white" : "text-muted",
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
    </>
  );
}
