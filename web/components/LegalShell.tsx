import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { LEGAL_UPDATED } from "@/lib/site";

export function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 sm:px-10 sm:py-4">
        <Logo />
        <Link href="/" className="inline-flex min-h-10 items-center px-2.5 text-sm font-bold hover:underline">Back</Link>
      </header>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-10 sm:px-10 sm:py-14">
        <article className="flex max-w-[66ch] flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-[32px] font-bold leading-tight">{title}</h1>
            <p className="text-[13px] text-muted">Last updated {LEGAL_UPDATED}</p>
          </div>
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

export function Clause({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="font-display text-[17px] font-bold">{title}</h2>
      <div className="flex flex-col gap-1 text-[15px] leading-relaxed text-muted [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">{children}</div>
    </section>
  );
}
