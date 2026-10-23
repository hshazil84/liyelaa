import { AUTH_ON, supabase } from "@/lib/supabase";

/** What we count. Matches the check on the events table. */
export type EventName = "visit" | "signup" | "login" | "font_started" | "import_svg" | "backup_saved" | "download_ttf" | "download_woff2" | "download_zip";

const ANON_KEY = "thaanafont-anon";

/** A random id kept in this browser so one visitor's steps can be counted together. It holds no personal details. */
function anonId(): string | null {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(ANON_KEY, id); }
    return id;
  } catch { return null; }
}

/**
 * Count one thing that happened, for example a font started or a download.
 * Only small counts go in `props`: never letter shapes, photos or file contents.
 * Never blocks or fails what the person is doing.
 */
export function track(name: EventName, props: Record<string, string | number | boolean> = {}): void {
  if (!AUTH_ON || typeof window === "undefined") return;
  void (async () => {
    try {
      const sb = supabase();
      if (!sb) return;
      const { data } = await sb.auth.getSession();
      await sb.from("events").insert({ name, props, user_id: data.session?.user.id ?? null, anon_id: anonId() });
    } catch { /* counting is a nice extra, never part of the work */ }
  })();
}
