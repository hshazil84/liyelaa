"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { AdminEmails } from "@/components/admin/AdminEmails";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminPeople } from "@/components/admin/AdminPeople";
import { useAuth } from "@/lib/auth";
import { rpc } from "@/lib/admin";

type Tab = "overview" | "people" | "emails" | "sales";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "people", label: "People" },
  { id: "emails", label: "Emails" },
  { id: "sales", label: "Sales" },
];

export function AdminClient() {
  const { ready, user, enabled } = useAuth();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!ready) return;
    if (!user) { setAdmin(null); return; }
    let alive = true;
    rpc<boolean>("is_admin").then((v) => alive && setAdmin(v === true)).catch(() => alive && setAdmin(false));
    return () => { alive = false; };
  }, [ready, user]);

  if (!enabled) return <Gate text="Sign-in is not set up here." />;
  if (!ready || (user && admin === null)) return <Gate text="Loading…" />;
  if (!user) return <Gate text="Log in to open the admin." link={{ href: "/login?next=/admin", label: "Log in" }} />;
  if (!admin) return <Gate text="This page is only for the site owner." link={{ href: "/", label: "Back to ThaanaFont" }} />;

  return (
    <div className="flex min-h-screen flex-col" data-testid="admin">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line bg-white px-4 py-3.5 sm:px-8">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="rounded-full bg-sand px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide">ADMIN</span>
        </div>
        <nav role="tablist" aria-label="Admin sections" className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} data-testid={`tab-${t.id}`} onClick={() => setTab(t.id)}
              className={`rounded-full px-3.5 py-2 text-sm font-bold ${tab === t.id ? "bg-ink text-white" : "text-muted hover:bg-paper"}`}>{t.label}</button>
          ))}
        </nav>
        <span className="text-[13px] text-muted sm:ml-auto">{user?.email}</span>
      </header>
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-7 sm:px-8 pb-24">
        {tab === "overview" && <AdminOverview />}
        {tab === "people" && <AdminPeople />}
        {tab === "emails" && <AdminEmails />}
        {tab === "sales" && (
          <>
            <h1 className="font-display text-[26px] font-bold leading-tight">Sales</h1>
            <p data-testid="sales-empty" className="rounded-2xl bg-sand px-4 py-3 text-sm font-semibold">Orders and invoices will show here once payments are connected.</p>
          </>
        )}
      </main>
    </div>
  );
}

function Gate({ text, link }: { text: string; link?: { href: string; label: string } }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <p data-testid="admin-gate" className="text-base font-medium">{text}</p>
      {link && <Link href={link.href} className="flex h-11 items-center rounded-xl bg-teal px-5 text-sm font-bold text-white hover:bg-teal-dark">{link.label}</Link>}
    </div>
  );
}
