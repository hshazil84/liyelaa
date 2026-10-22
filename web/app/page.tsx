import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThaanaOutline } from "@/components/ThaanaOutline";

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/** The printed template sheet, peeking up into the card: corner squares, a box for every letter, a baseline in each. */
function TemplateSheet() {
  const ink: Record<number, "ga" | "ba"> = { 1: "ga", 2: "ba", 5: "ba", 6: "ga", 9: "ga", 10: "ba", 13: "ba", 17: "ga" };
  return (
    <div aria-hidden className="relative h-[250px] w-[210px] shrink-0 -rotate-3 rounded-md bg-white px-4 pb-3.5 pt-[26px] shadow-[0_4px_14px_rgba(38,64,34,0.18)]">
      <i className="absolute left-2 top-2 h-[11px] w-[11px] bg-ink" />
      <i className="absolute right-2 top-2 h-[11px] w-[11px] bg-ink" />
      <i className="absolute bottom-2 left-2 h-[11px] w-[11px] bg-ink" />
      <i className="absolute bottom-2 right-2 h-[11px] w-[11px] bg-ink" />
      <i className="absolute left-7 top-[11px] h-[5px] w-12 rounded-sm bg-ink" />
      <i className="absolute right-7 top-3 h-1 w-[26px] rounded-sm bg-[#BDCFC2]" />
      <div className="grid h-full grid-cols-4 border border-[#CFD9D2]">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="relative border-[0.5px] border-[#CFD9D2]">
            <i className="absolute inset-x-0 top-[22%] border-t-[0.5px] border-dashed border-[#BDCFC2]" />
            <i className="absolute inset-x-0 top-[68%] border-t border-[#8FA495]" />
            <i className="absolute bottom-[3px] right-[3px] h-0.5 w-2.5 bg-[#D4DDD6]" />
            {ink[i] && (
              <span className="absolute inset-x-0 top-0 flex h-[68%] items-end justify-center text-ink">
                <ThaanaOutline id={ink[i]} size={15} />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type CardProps = {
  title: string;
  text: string;
  cta: string;
  href?: string;
  tone: string;
  peek?: boolean;     // the picture starts at the top and runs off the bottom edge
  children: React.ReactNode;
};

function Card({ title, text, cta, href, tone, peek, children }: CardProps) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-1 basis-[300px] flex-col gap-5 rounded-[28px] border border-line bg-white p-6">
      <div className={`flex h-[180px] justify-center gap-3 overflow-hidden rounded-[20px] ${peek ? "items-start pt-[18px]" : "items-center"} ${tone}`}>{children}</div>
      <div className="flex flex-1 flex-col gap-2">
        <h2 className="font-display text-[26px] font-bold leading-tight">{title}</h2>
        <p className="text-base leading-normal text-muted">{text}</p>
      </div>
      {href ? (
        <Link href={href} className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-teal text-lg font-bold text-white hover:bg-teal-dark">
          {cta}
          <Arrow />
        </Link>
      ) : (
        <span aria-disabled className="inline-flex h-14 items-center justify-center rounded-2xl bg-paper text-base font-bold text-muted">
          Coming next
        </span>
      )}
    </section>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-8 border-b border-line bg-white px-10 py-4">
        <Logo />
      </header>
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-9 px-10 py-14">
        <div className="flex flex-col gap-2.5">
          <h1 className="font-display text-5xl font-bold leading-[1.05]">What do you want to do?</h1>
          <p className="text-lg text-muted">Pick one. You can always come back and try another.</p>
        </div>
        <div className="flex flex-wrap gap-6">
          <Card
            title="Play with a font"
            text="Make it thin or bold, lean it, stretch it, change the spacing."
            cta="Start playing"
            href="/play"
            tone="bg-sand"
          >
            {(["w400", "w700", "w900"] as const).map((w) => (
              <span key={w} className="text-ink">
                <ThaanaOutline id={w} size={40} label="ދިވެހި" />
              </span>
            ))}
          </Card>
          <Card
            title="Make a font from my handwriting"
            text="Write the letters on paper, take a photo, and turn them into a font."
            cta="Start with a photo"
            href="/handwriting"
            tone="bg-teal-soft"
            peek
          >
            <TemplateSheet />
          </Card>
          <Card
            title="Draw or import my own"
            text="Draw with the pen tool, or bring in SVG artwork from Illustrator or other vector apps."
            cta="Open the editor"
            href="/draw"
            tone="bg-coral-soft"
          >
            <svg aria-hidden viewBox="0 0 220 100" width="200" height="90">
              <path d="M20 70 C 60 10, 110 10, 120 50 S 170 90, 200 30" fill="none" stroke="#264022" strokeWidth="3" strokeLinecap="round" />
              <path d="M20 70 L 55 28 M120 50 L 150 86" stroke="#FA7E00" strokeWidth="1.5" fill="none" />
              {[[15, 65], [115, 45], [195, 25]].map(([x, y]) => (
                <rect key={x} x={x} y={y} width="10" height="10" fill="#fff" stroke="#FA7E00" strokeWidth="2" />
              ))}
            </svg>
          </Card>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">No account needed to try it.</p>
          <p className="text-sm text-muted" data-testid="beta-note"><b className="text-ink">ThaanaFont is in beta.</b> Things may break. Your work is saved in this browser only, so save a project file now and then.</p>
        </div>
      </main>
    </div>
  );
}
