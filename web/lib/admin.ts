import { supabase } from "@/lib/supabase";

export type Overview = {
  visits: number; visits_prev: number | null;
  signups: number; signups_prev: number | null;
  started: number; downloads: number; active_week: number;
  by_path: { photo: number; draw: number; svg: number };
  by_format: { ttf: number; woff2: number; zip: number };
  avg_letters: number | null;
  daily: { day: string; n: number }[];
};

export type Person = {
  id: string; email: string | null; joined: string; last_seen: string | null;
  fonts: number; downloads: number; marketing_ok: boolean; tags: string[]; note: string;
};

export type PersonEvent = { name: string; props: Record<string, string | number | boolean>; at: string };
export type SentEmail = { id: number; subject: string; audience: string; recipients: number; at: string };

export type Filter = "all" | "no_download" | "downloaded" | "opted_in" | "inactive";

export const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "no_download", label: "Made a font, never downloaded" },
  { id: "downloaded", label: "Downloaded" },
  { id: "opted_in", label: "Opted in to updates" },
  { id: "inactive", label: "Not active in 14 days" },
];

/** Calls a database function as the signed-in person. The database refuses anyone who is not an admin. */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const sb = supabase();
  if (!sb) throw new Error("Sign-in is not set up.");
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function ago(iso: string | null): string {
  if (!iso) return "Never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) { const h = Math.round(s / 3600); return `${h} ${h === 1 ? "hour" : "hours"} ago`; }
  const d = Math.round(s / 86400);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Indian/Maldives" });
}

/** One plain line for a counted event. */
export function eventLine(e: PersonEvent): string {
  const p = e.props ?? {};
  const letters = typeof p.letters === "number" ? ` (${p.letters} letters)` : "";
  switch (e.name) {
    case "visit": return "Visited";
    case "signup": return "Signed up";
    case "login": return "Logged in";
    case "font_started": return `Started a font${p.path ? ` (${p.path === "draw" ? "drawn" : "photo"})` : ""}`;
    case "import_svg": return `Imported SVG letters${letters}`;
    case "backup_saved": return "Saved a project file";
    case "download_ttf": return `Downloaded .ttf${letters}`;
    case "download_woff2": return `Downloaded .woff2${letters}`;
    case "download_zip": return `Downloaded the zip${letters}`;
    default: return e.name;
  }
}

function cell(v: string | number | boolean | null): string {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function peopleCsv(rows: Person[]): string {
  const head = ["email", "joined", "last_seen", "fonts_started", "downloads", "opted_in", "tags", "note"];
  const body = rows.map((p) => [p.email, p.joined, p.last_seen, p.fonts, p.downloads, p.marketing_ok, p.tags.join(" | "), p.note].map((v) => cell(v ?? null)).join(","));
  return [head.join(","), ...body].join("\n");
}

export function saveText(text: string, filename: string, type = "text/csv"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
