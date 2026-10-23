"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Add01Icon, ArrowRight01Icon, Cancel01Icon, Comment01Icon, Copy01Icon, FloppyDiskIcon, FolderLibraryIcon,
  HelpCircleIcon, InstagramIcon, LegalDocument01Icon, Logout01Icon, Mail01Icon, Shield01Icon, Tick02Icon, UserIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/Icon";
import { INTRO_EVENT } from "@/components/IntroModal";
import { NewFontDialog } from "@/components/NewFontDialog";
import { logOut, useAuth } from "@/lib/auth";
import { saveProjectFile } from "@/lib/handwriting/projectfile";
import { listFonts, type FontMeta } from "@/lib/handwriting/store";
import { FEEDBACK_EMAIL, FEEDBACK_SUBJECT, INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/site";

const row = "flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 text-left text-[15px] font-semibold hover:bg-paper";

/** The one floating button on every page: account, fonts, help and feedback. */
export function AccountMenu() {
  const { ready, user, enabled } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "feedback">("menu");
  const [fonts, setFonts] = useState<FontMeta[] | null>(null);
  const [making, setMaking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => { listFonts().then(setFonts).catch(() => setFonts([])); };
    load();
    window.addEventListener("thaanafont-fonts", load);
    return () => window.removeEventListener("thaanafont-fonts", load);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  useEffect(() => { if (!open) { setView("menu"); setNote(null); } }, [open]);

  const cur = fonts?.find((f) => f.active);
  const initial = user?.email ? user.email[0].toUpperCase() : null;
  const signedOut = enabled && ready && !user;

  async function save() {
    try { setNote(`${await saveProjectFile()} is in your downloads.`); } catch { setNote("I could not save the file. Try again."); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(FEEDBACK_EMAIL); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  return (
    <>
      <div ref={box} className="fixed z-30 flex flex-col items-end gap-3" style={{ right: "max(16px, env(safe-area-inset-right, 0px))", bottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}>
        {open && (
          <div role="dialog" aria-label="Account and help" data-testid="account-panel"
            className="flex max-h-[calc(100vh-96px)] w-[min(340px,calc(100vw-32px))] flex-col overflow-y-auto rounded-[22px] border border-line bg-white shadow-[0_12px_40px_rgba(0,0,0,.2)]">
            {view === "feedback" ? (
              <div className="flex flex-col gap-2.5 p-4" data-testid="feedback-panel">
                <b className="font-display text-base">Tell us what happened</b>
                <span className="text-[13px] leading-snug text-muted">Something broke, something confused you, or you have an idea. Say which step you were on.</span>
                <a href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}`} data-testid="feedback-email" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal px-3 text-sm font-bold text-white hover:bg-teal-dark"><Icon icon={Mail01Icon} size={18} />Email {FEEDBACK_EMAIL}</a>
                <button type="button" onClick={() => void copy()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#BDCFC2] px-3 text-sm font-bold hover:bg-paper"><Icon icon={copied ? Tick02Icon : Copy01Icon} size={18} />{copied ? "Copied" : "Copy the address"}</button>
                <button type="button" onClick={() => setView("menu")} className="self-start text-sm font-bold text-teal underline underline-offset-4">Back</button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 p-4 pb-3">
                  <span aria-hidden className="grid h-12 w-12 flex-none place-items-center rounded-full bg-teal-soft text-lg font-extrabold">{initial ?? <Icon icon={UserIcon} size={22} />}</span>
                  <div className="min-w-0">
                    <b className="block font-display text-[17px] leading-tight">{user ? "My account" : "ThaanaFont"}</b>
                    <span className="block truncate text-[13.5px] text-muted" data-testid="nav-email">{user ? user.email : signedOut ? "Not logged in" : "Free while in beta"}</span>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="ml-auto grid h-10 w-10 flex-none place-items-center rounded-full text-muted hover:bg-paper"><Icon icon={Cancel01Icon} size={20} /></button>
                </div>

                {signedOut && (
                  <div className="flex gap-2 px-4 pb-3">
                    <Link href="/login" data-testid="nav-login" className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[#BDCFC2] text-sm font-bold hover:bg-paper">Log in</Link>
                    <Link href="/signup" data-testid="nav-signup" className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-teal text-sm font-bold text-white hover:bg-teal-dark">Sign up</Link>
                  </div>
                )}

                <div className="flex flex-col gap-0.5 border-t border-line p-2.5">
                  <p className="px-2.5 pb-1 pt-1 text-xs font-bold uppercase tracking-[.08em] text-muted">My fonts</p>
                  {cur && (
                    <div className="mx-0.5 mb-1 flex items-center gap-2.5 rounded-[14px] bg-lilac-soft px-3 py-2.5 text-sm">
                      <b className="truncate">{cur.title}</b>
                      <span className="ml-auto whitespace-nowrap text-xs font-bold text-grape">{cur.count} of 38</span>
                    </div>
                  )}
                  <Link href="/handwriting/fonts" onClick={() => setOpen(false)} data-testid="account-fonts" className={row}><Icon icon={FolderLibraryIcon} />All my fonts{fonts && <span className="ml-auto text-[13px] font-medium text-muted">{fonts.length}</span>}</Link>
                  <button type="button" onClick={() => { setOpen(false); setMaking(true); }} data-testid="account-new-font" className={row}><Icon icon={Add01Icon} />New font</button>
                  <button type="button" onClick={() => void save()} data-testid="account-save" className={row}><Icon icon={FloppyDiskIcon} />Save project file</button>
                  {note && <p role="status" className="mx-2 rounded-lg bg-[#F3F9F5] px-3 py-2 text-xs leading-snug">{note}</p>}
                </div>

                <div className="flex flex-col gap-0.5 border-t border-line p-2.5">
                  <p className="px-2.5 pb-1 pt-1 text-xs font-bold uppercase tracking-[.08em] text-muted">Help</p>
                  <button type="button" onClick={() => { setOpen(false); window.dispatchEvent(new Event(INTRO_EVENT)); }} data-testid="account-intro" className={row}><Icon icon={HelpCircleIcon} />How it works</button>
                  <button type="button" onClick={() => setView("feedback")} data-testid="feedback-open" className={row}><Icon icon={Comment01Icon} />Send feedback<Icon icon={ArrowRight01Icon} size={16} className="ml-auto text-muted" /></button>
                  <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={row}><Icon icon={InstagramIcon} />{INSTAGRAM_HANDLE}</a>
                </div>

                <div className="flex flex-col gap-0.5 border-t border-line p-2.5">
                  <Link href="/terms" onClick={() => setOpen(false)} className={row}><Icon icon={LegalDocument01Icon} />Terms</Link>
                  <Link href="/privacy" onClick={() => setOpen(false)} className={row}><Icon icon={Shield01Icon} />Privacy</Link>
                </div>

                {enabled && ready && user && (
                  <div className="border-t border-line p-2.5">
                    <button type="button" onClick={() => { setOpen(false); void logOut(); }} data-testid="nav-logout" className={row}><Icon icon={Logout01Icon} />Log out</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <button type="button" aria-expanded={open} aria-haspopup="dialog" data-testid="account-open" onClick={() => setOpen((o) => !o)}
          aria-label={user ? "Account and help" : "Menu and help"}
          className={`grid h-14 w-14 place-items-center rounded-full text-xl font-extrabold shadow-[0_6px_20px_rgba(0,0,0,.25)] ${open ? "bg-teal-soft text-ink ring-2 ring-ink" : "bg-teal text-white hover:bg-teal-dark"}`}>
          {initial ?? <Icon icon={UserIcon} size={24} />}
        </button>
      </div>
      {making && <NewFontDialog onClose={() => setMaking(false)} />}
    </>
  );
}
