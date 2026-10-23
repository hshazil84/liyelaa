"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ago, dayLabel, eventLine, FILTERS, peopleCsv, rpc, saveText, type Filter, type Person, type PersonEvent } from "@/lib/admin";

const PAGE = 100;
type Page = { total: number; rows: Person[] };

export function AdminPeople() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<Person[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 250); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async (offset: number, replace: boolean) => {
    setLoading(true); setErr(null);
    try {
      const p = await rpc<Page>("admin_people", { p_search: q, p_filter: filter, p_limit: PAGE, p_offset: offset });
      setTotal(p.total);
      setRows((cur) => (replace ? p.rows : [...cur, ...p.rows]));
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not load."); }
    setLoading(false);
  }, [q, filter]);

  useEffect(() => { void load(0, true); }, [load]);

  async function csv() {
    try {
      const p = await rpc<Page>("admin_people", { p_search: q, p_filter: filter, p_limit: 5000, p_offset: 0 });
      saveText(peopleCsv(p.rows), `thaanafont-people-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not make the file."); }
  }

  const open = rows.find((r) => r.id === openId) ?? null;
  function patch(id: string, p: Partial<Person>) { setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...p } : r))); }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-bold leading-tight">People <span className="text-[15px] font-semibold text-muted" data-testid="people-total">{total}</span></h1>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Search people" data-testid="people-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email, tag or note"
            className="h-11 w-full rounded-xl border border-[#BDCFC2] bg-white px-3 text-sm sm:w-[260px]" />
          <button type="button" data-testid="people-csv" onClick={() => void csv()} className="h-11 rounded-xl border border-[#BDCFC2] bg-white px-4 text-sm font-bold hover:bg-paper">Download CSV</button>
        </div>
      </div>

      <div role="group" aria-label="Filter people" className="flex flex-wrap gap-1 text-[13px] font-bold">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" data-testid={`filter-${f.id}`} aria-pressed={filter === f.id} onClick={() => { setFilter(f.id); setOpenId(null); }}
            className={`rounded-full px-3 py-1.5 ${filter === f.id ? "bg-white text-ink ring-1 ring-line" : "text-muted hover:bg-white/60"}`}>{f.label}</button>
        ))}
      </div>

      {err && <p role="alert" className="rounded-xl bg-coral-soft px-4 py-3 text-sm font-medium">{err}</p>}

      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <div className="w-full min-w-0 flex-1 overflow-x-auto rounded-[18px] border border-line bg-white p-2">
          <table className="w-full min-w-[640px] border-collapse text-sm" data-testid="people-table">
            <thead>
              <tr className="text-left text-xs text-muted">
                {["Email", "Joined", "Last seen", "Fonts", "Downloads", "Tags"].map((h) => <th key={h} className="border-b border-line px-2.5 py-2 font-bold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="person-row" onClick={() => setOpenId(r.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(r.id); }}
                  className={`cursor-pointer border-b border-line hover:bg-[#F3F9F5] ${openId === r.id ? "bg-[#F3F9F5] font-bold" : ""}`}>
                  <td className="px-2.5 py-3">{r.email ?? "(no email)"}</td>
                  <td className="whitespace-nowrap px-2.5 py-3">{dayLabel(r.joined)}</td>
                  <td className="whitespace-nowrap px-2.5 py-3">{ago(r.last_seen)}</td>
                  <td className="px-2.5 py-3">{r.fonts}</td>
                  <td className="px-2.5 py-3">{r.downloads}</td>
                  <td className="px-2.5 py-3">{r.tags.map((t) => <span key={t} className="mr-1 inline-block rounded-full bg-[#F3F9F5] px-2 py-0.5 text-[11px] font-extrabold">{t}</span>)}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan={6} className="px-2.5 py-6 text-center text-muted">No one matches.</td></tr>}
            </tbody>
          </table>
          {rows.length < total && (
            <button type="button" data-testid="people-more" disabled={loading} onClick={() => void load(rows.length, false)} className="m-2 h-10 rounded-lg border border-[#BDCFC2] px-4 text-sm font-bold hover:bg-paper">Show more</button>
          )}
        </div>
        {open && <Detail key={open.id} p={open} onSaved={(n, t) => patch(open.id, { note: n, tags: t })} />}
      </div>
    </>
  );
}

function Detail({ p, onSaved }: { p: Person; onSaved: (note: string, tags: string[]) => void }) {
  const [note, setNote] = useState(p.note);
  const [tags, setTags] = useState<string[]>(p.tags);
  const [tag, setTag] = useState("");
  const [events, setEvents] = useState<PersonEvent[] | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    rpc<PersonEvent[]>("admin_person_events", { p_id: p.id }).then((v) => alive.current && setEvents(v)).catch(() => alive.current && setEvents([]));
    return () => { alive.current = false; };
  }, [p.id]);

  function addTag() {
    const t = tag.trim().toLowerCase().slice(0, 30);
    if (t && !tags.includes(t) && tags.length < 10) setTags([...tags, t]);
    setTag("");
  }
  async function save() {
    setState("saving");
    try {
      await rpc("admin_set_note", { p_id: p.id, p_note: note, p_tags: tags });
      onSaved(note, tags);
      setState("saved");
    } catch { setState("error"); }
  }

  return (
    <aside data-testid="person-detail" className="flex w-full shrink-0 flex-col gap-3 rounded-[18px] border border-line bg-white p-4 text-sm lg:w-[340px]">
      <b className="break-all font-display text-base">{p.email}</b>
      <span className="text-[13px] text-muted">Joined {dayLabel(p.joined)} · {p.marketing_ok ? "opted in to updates" : "not opted in to updates"}</span>
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((t) => (
          <button key={t} type="button" aria-label={`Remove tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))} className="rounded-full bg-[#ECE6FA] px-2 py-0.5 text-[11px] font-extrabold text-[#5B4A99]">{t} ×</button>
        ))}
        <input aria-label="Add a tag" data-testid="tag-input" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} onBlur={addTag}
          placeholder="+ tag" className="h-7 w-20 rounded-full border border-dashed border-[#BDCFC2] px-2 text-[11px] font-bold" />
      </div>
      <textarea aria-label="Note" data-testid="note-input" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="A note only you can see"
        className="h-[84px] w-full resize-y rounded-xl border border-[#BDCFC2] p-3 text-sm" />
      <div className="flex items-center gap-3">
        <button type="button" data-testid="note-save" onClick={() => void save()} disabled={state === "saving"} className="h-10 rounded-xl bg-teal px-4 text-sm font-bold text-white hover:bg-teal-dark">Save</button>
        <span role="status" className="text-[13px] text-muted">{state === "saved" ? "Saved" : state === "error" ? "Could not save. Try again." : ""}</span>
      </div>
      <b className="mt-1">Recent activity</b>
      <div className="flex flex-col">
        {events === null && <span className="text-muted">Loading…</span>}
        {events?.length === 0 && <span className="text-muted">Nothing counted yet.</span>}
        {events?.map((e, i) => (
          <div key={i} className="flex gap-2 border-b border-dashed border-line py-1.5 text-[13px]"><em className="w-[92px] shrink-0 not-italic text-muted">{ago(e.at)}</em>{eventLine(e)}</div>
        ))}
      </div>
    </aside>
  );
}
