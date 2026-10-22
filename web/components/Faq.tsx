const QA = [
  { q: "Is it free?", a: "Yes, while ThaanaFont is in beta. Downloads will cost something later. We will tell you before that starts." },
  { q: "Do I need an account?", a: "Yes. Sign up with your email to use the tools. It takes under a minute." },
  { q: "Where are my letters saved?", a: "In your browser, on this device. Clearing your browser data deletes them. Save a project file now and then, and open it on any device to carry on." },
  { q: "Are my photos uploaded?", a: "No. Photos are read inside your browser. When you download, only the letter shapes are sent to our server to build the font file." },
  { q: "Can I use my font for work or sell it?", a: "Fonts made from your own handwriting or drawings are yours to use as you like." },
  { q: "Something broke. What now?", a: "Tap Send feedback at the bottom of the page and tell us what happened. It is a beta, so this helps." },
];

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="flex flex-col gap-3">
      <h2 id="faq-title" className="font-display text-[28px] font-bold leading-tight">Questions</h2>
      <div className="flex max-w-[720px] flex-col">
        {QA.map((x, i) => (
          <details key={x.q} open={i === 0} className="group border-t border-line last:border-b">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-base font-bold [&::-webkit-details-marker]:hidden">
              {x.q}
              <span aria-hidden className="shrink-0 text-xl text-muted group-open:hidden">+</span>
              <span aria-hidden className="hidden shrink-0 text-xl text-muted group-open:inline">–</span>
            </summary>
            <p className="max-w-[60ch] pb-4 text-[15px] leading-normal text-muted">{x.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
