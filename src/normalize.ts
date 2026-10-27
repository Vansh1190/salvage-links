const TRAILING_SLASH_HOSTS = new Set(["", "index.php"]);

export function canonicalUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^<|>$/g, "");
  if (!trimmed) return "";
  let withScheme = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(withScheme)) withScheme = "https://" + withScheme;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return trimmed;
  }
  if (u.protocol === "javascript:" || u.protocol === "data:" || u.protocol === "blob:") return trimmed;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.protocol = u.protocol.toLowerCase();
  if (u.pathname === "/" ) u.pathname = "/";
  else u.pathname = u.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  for (const k of [...u.searchParams.keys()]) {
    if (/^(utm_|mc_|fbclid|gclid|ref|ref_src|igshid|spm|si$|t$)/.test(k)) u.searchParams.delete(k);
  }
  if (u.port === "443" && u.protocol === "https:") u.port = "";
  if (u.port === "80" && u.protocol === "http:") u.port = "";
  if (TRAILING_SLASH_HOSTS.has(u.pathname.slice(1))) return u.toString();
  return u.toString();
}

export function domainOf(canonical: string): string {
  try {
    return new URL(canonical).hostname;
  } catch {
    return "";
  }
}

export function dedupeKey(canonical: string): string {
  let u: URL;
  try {
    u = new URL(canonical);
  } catch {
    return canonical.toLowerCase();
  }
  const path = u.pathname === "" ? "/" : u.pathname;
  const q = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const qs = q.length ? "?" + q.map(([k, v]) => `${k}=${v}`).join("&") : "";
  return `${u.protocol}//${u.hostname}${u.port ? ":" + u.port : ""}${path}${qs}`.toLowerCase();
}

export function titleFromUrl(canonical: string): string {
  try {
    const u = new URL(canonical);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? u.hostname;
    return decodeURIComponent(last).replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[-_]+/g, " ").slice(0, 80) || u.hostname;
  } catch {
    return canonical.slice(0, 80);
  }
}

export function isHttpish(raw: string): boolean {
  try {
    const p = new URL(raw).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

export function normalizeTitle(t: string): string {
  return t
    .replace(/\s+/g, " ")
    .replace(/[|·–—-]\s*[^|·–—-]{2,40}$/, "")
    .trim()
    .toLowerCase();
}
