import Link from "next/link";
import { InstagramIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/Icon";
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
            <Icon icon={InstagramIcon} size={18} />
            {INSTAGRAM_HANDLE}
          </a>
        </nav>
      </div>
    </footer>
  );
}
