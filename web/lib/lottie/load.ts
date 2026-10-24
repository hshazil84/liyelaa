type Lottie = typeof import("lottie-web/build/player/lottie_light").default;
type Loaded = { lottie: Lottie; data: unknown };

let pending: Promise<Loaded> | null = null;

/** The player and the animation file, fetched once and kept, so the second call is instant. */
export function loadDesigner(): Promise<Loaded> {
  if (!pending) {
    pending = Promise.all([import("lottie-web/build/player/lottie_light"), import("@/lib/lottie/designer.json")])
      .then(([l, d]) => ({ lottie: l.default, data: d.default as unknown }))
      .catch((e) => { pending = null; throw e; });
  }
  return pending;
}

/** The player changes the data it is given, so each animation gets its own copy. */
export function copyOf<T>(data: T): T {
  return typeof structuredClone === "function" ? structuredClone(data) : JSON.parse(JSON.stringify(data));
}

/** Starts the fetch once the page is idle, so the animation is already here when a wait begins. */
export function warmDesigner() {
  if (typeof window === "undefined") return;
  const go = () => { loadDesigner().catch(() => {}); };
  if ("requestIdleCallback" in window) (window as unknown as { requestIdleCallback: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback(go, { timeout: 3000 });
  else setTimeout(go, 1500);
}
