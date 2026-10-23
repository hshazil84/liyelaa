"use client";

import { useCallback, useEffect, useState } from "react";
import { dayLabel, rpc, type SentEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

const AUDIENCES = [
  { id: "all", label: "Everyone who opted in" },
  { id: "no_download", label: "Opted in, made a font, never downloaded" },
  { id: "downloaded", label: "Opted in, downloaded" },
  { id: "inactive", label: "Opted in, not active in 14 days" },
];

type Result = { kind: "ok" | "bad"; text: string };

export function AdminEmails() {
  const [audience, setAudience] = useState("all");
  const [count, setCount] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<SentEmail[]>([]);

  const loadHistory = useCallback(() => { rpc<SentEmail[]>("admin_sent_emails").then(setHistory).catch(() => setHistory([])); }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => {
    let alive = true;
    setCount(null);
    rpc<{ count: number }>("admin_audience", { p_filter: audience }).then((v) => alive && setCount(v.count)).catch(() => alive && setCount(0));
    return () => { alive = false; };
  }, [audience]);

  const ready = subject.trim().length > 0 && message.trim().length > 0;

  async function send(mode: "test" | "all") {
    setBusy(true); setResult(null); setConfirming(false);
    try {
      const { data } = (await supabase()?.auth.getSession()) ?? { data: { session: null } };
      const res = await fetch("/api/admin/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ subject, message, filter: audience, mode }),
      });
      const j = (await res.json()) as { sent?: number; failed?: number; error?: string };
      if (!res.ok) setResult({ kind: "bad", text: j.error ?? "Could not send." });
      else if (mode === "test") setResult({ kind: "ok", text: "Test sent to your own address." });
      else setResult({ kind: j.failed ? "bad" : "ok", text: `Sent to ${j.sent}${j.failed ? `, ${j.failed} did not go through` : ""}.` });
      if (mode === "all") loadHistory();
    } catch { setResult({ kind: "bad", text: "Could not reach the server." }); }
    setBusy(false);
  }

  const field = "w-full rounded-xl border border-[#BDCFC2] bg-white px-3 py-2.5 text-sm";
  return (
    <>
      <h1 className="font-display text-[26px] font-bold leading-tight">Emails</h1>
      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <section className="flex w-full min-w-0 flex-[1.2] flex-col gap-3 rounded-[18px] border border-line bg-white p-5">
          <h2 className="font-display text-base font-bold">Write an update</h2>
          <label className="flex flex-col gap-1 text-[13px] text-muted">Send to
            <select data-testid="audience" value={audience} onChange={(e) => setAudience(e.target.value)} className={`${field} h-11 text-ink`}>
              {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <span data-testid="audience-count" className="font-bold text-ink">{count === null ? "Counting…" : `${count} ${count === 1 ? "person" : "people"}`}</span>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">Subject
            <input data-testid="subject" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} className={`${field} h-11 text-ink`} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">Message
            <textarea data-testid="message" value={message} maxLength={10000} onChange={(e) => setMessage(e.target.value)} className={`${field} h-[170px] resize-y text-ink`} />
          </label>
          <p className="text-xs text-muted">Every email gets an unsubscribe link automatically. Only people who ticked “send me updates” are included. Replies go to the feedback address.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="send-test" disabled={!ready || busy} onClick={() => void send("test")} className="h-11 rounded-xl border border-[#BDCFC2] bg-white px-4 text-sm font-bold hover:bg-paper disabled:opacity-50">Send a test to me</button>
            <button type="button" data-testid="send-all" disabled={!ready || busy || !count} onClick={() => setConfirming(true)} className="h-11 rounded-xl bg-coral px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
              {count ? `Send to ${count} ${count === 1 ? "person" : "people"}` : "No one to send to"}
            </button>
            {result && <span role="status" data-testid="send-result" className={`text-sm font-semibold ${result.kind === "bad" ? "text-plum" : "text-ink"}`}>{result.text}</span>}
          </div>
        </section>

        <section className="w-full min-w-0 flex-[0.8] rounded-[18px] border border-line bg-white p-5">
          <h2 className="mb-3 font-display text-base font-bold">Sent</h2>
          {history.length === 0 ? <p className="text-sm text-muted">Nothing sent yet.</p> : (
            <table className="w-full border-collapse text-sm" data-testid="sent-table">
              <thead><tr className="text-left text-xs text-muted"><th className="border-b border-line py-2 pr-2 font-bold">Subject</th><th className="border-b border-line py-2 pr-2 font-bold">Sent</th><th className="border-b border-line py-2 font-bold">To</th></tr></thead>
              <tbody>{history.map((h) => <tr key={h.id}><td className="border-b border-line py-2.5 pr-2">{h.subject}</td><td className="whitespace-nowrap border-b border-line py-2.5 pr-2">{dayLabel(h.at)}</td><td className="border-b border-line py-2.5">{h.recipients}</td></tr>)}</tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-muted">Welcome and password emails go out on their own and are not listed here.</p>
        </section>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirming(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="send-title" data-testid="send-dialog" className="flex w-full max-w-[460px] flex-col gap-4 rounded-3xl bg-white p-6 shadow-xl">
            <h2 id="send-title" className="font-display text-xl font-bold">Send to {count} {count === 1 ? "person" : "people"}?</h2>
            <p className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-medium">“{subject}” goes out now. This cannot be undone.</p>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" data-testid="confirm-send" onClick={() => void send("all")} className="h-11 rounded-xl bg-coral px-4 text-sm font-bold text-white">Send it</button>
              <button type="button" onClick={() => setConfirming(false)} className="h-11 rounded-xl border border-[#BDCFC2] px-4 text-sm font-bold hover:bg-paper">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
