import { HowArt, HOW_STEPS } from "@/components/HowArt";
import { SignUpCta } from "@/components/SignUpCta";

/** One flat band with the three steps, so it reads as an explainer and not as three more choices. */
export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="flex flex-col gap-5">
      <h2 id="how-title" className="font-display text-[28px] font-bold leading-tight">How it works</h2>
      <div className="grid rounded-[28px] border border-line bg-white p-4 sm:p-5 md:grid-cols-3 md:px-0">
        {HOW_STEPS.map((s) => (
          <div key={s.n} className="relative flex min-w-0 flex-col gap-3 px-1 py-4 first:pt-1 md:px-5 md:py-1 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-dashed [&:not(:first-child)]:border-[#CFD9D2] md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:border-t-0">
            <div className="overflow-hidden rounded-2xl bg-paper"><HowArt step={s.n} label={s.alt} /></div>
            <div className="mt-1 flex items-center gap-2.5">
              <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">{s.n}</span>
              <h3 className="font-display text-[17px] font-bold leading-snug">{s.title}</h3>
            </div>
            <p className="text-[15px] leading-normal text-muted">{s.text}</p>
          </div>
        ))}
      </div>
      <SignUpCta />
    </section>
  );
}
