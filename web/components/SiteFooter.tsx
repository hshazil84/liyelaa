import Link from "next/link";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/site";

export function SiteFooter() {
  const link = "inline-flex min-h-11 items-center gap-2 text-[13px] font-bold text-ink hover:underline";
  return (
    <footer data-testid="site-footer" className="mt-auto border-t border-line px-5 py-3 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-5 gap-y-1">
        <span className="text-[13px] text-muted">© 2026 ThaanaFont</span>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-4">
          <Link href="/terms" className={link}>Terms</Link>
          <Link href="/privacy" className={link}>Privacy</Link>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={link}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
            </svg>
            {INSTAGRAM_HANDLE}
          </a>
        </nav>
      </div>
    </footer>
  );
}
