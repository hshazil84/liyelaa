import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";

export function AuthShell({ other, children }: { other: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-5 py-3 sm:px-10 sm:py-4">
        <Logo />
        <Link href={other.href} className="inline-flex min-h-10 items-center px-2.5 text-sm font-bold hover:underline">{other.label}</Link>
      </header>
      <main className="flex flex-1 justify-center px-5 py-10 sm:py-14">{children}</main>
      <SiteFooter />
    </div>
  );
}
