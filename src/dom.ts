export type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null,
  ...children: (Node | string | null | undefined | (Node | string)[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (v === true) {
        el.setAttribute(k, "");
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  add(el, children);
  return el;
}

function add(el: Node, children: (Node | string | null | undefined | (Node | string)[])[]) {
  for (const c of children) {
    if (c === null || c === undefined) continue;
    if (Array.isArray(c)) add(el, c);
    else el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let liveRegion: HTMLElement | null = null;
export function announce(message: string): void {
  if (!liveRegion) {
    liveRegion = h("div", { id: "live", class: "sr-only", role: "status", "aria-live": "polite" });
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = "";
  window.setTimeout(() => {
    if (liveRegion) liveRegion.textContent = message;
  }, 30);
}

export function shortHost(domain: string): string {
  return domain.length > 28 ? domain.slice(0, 27) + "…" : domain;
}

export function relTime(ts: number | null, now: number): string {
  if (ts === null) return "never";
  const s = (now - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  if (s < 86400 * 365) return `${Math.floor(s / (86400 * 30))}mo ago`;
  return `${(s / (86400 * 365)).toFixed(1)}y ago`;
}

export function dateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
