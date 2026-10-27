import { canonicalUrl, dedupeKey, domainOf, isHttpish, titleFromUrl } from "./normalize.ts";
import type { SalvageLink } from "./model.ts";
import { hashId } from "./hash.ts";

export interface ParsedBookmark {
  url: string;
  title: string;
  folder: string;
  addDate: number | null;
  tags: string[];
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)));
}

function safeCodePoint(n: number): string {
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return "";
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`, "i");
  const m = re.exec(tag);
  if (!m) return null;
  return decodeEntities(m[1] ?? m[2] ?? "");
}

/**
 * Parses the Netscape bookmark file format exported by Chrome/Firefox/Safari.
 * Token scan (not line split, not DOMParser) so it is testable outside a browser,
 * tolerant of files that put several anchors on one line, and tolerant of the
 * malformed exports real users produce.
 */
export function parseBookmarksHtml(text: string): ParsedBookmark[] {
  const out: ParsedBookmark[] = [];
  const stack: string[] = [];
  const tokens = /(<H3\b[^>]*>[\s\S]*?<\/H3>)|(<A\b[^>]*>[\s\S]*?<\/A>)|(<DL\b)|(<\/DL>)/gi;
  const stripped = text.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  for (const match of stripped.matchAll(tokens)) {
    const [token, h3, anchor, dlOpen, dlClose] = match;
    void token;
    if (h3 !== undefined) {
      const name = decodeEntities(h3.replace(/<[^>]*>/g, "")).trim();
      stack.push(name || "Untitled folder");
      continue;
    }
    if (dlClose !== undefined) {
      stack.pop();
      continue;
    }
    if (dlOpen !== undefined) continue;
    if (anchor !== undefined) {
      const openTag = anchor.slice(0, anchor.indexOf(">") + 1);
      const href = attr(openTag, "HREF");
      if (!href) continue;
      const inner = anchor.slice(anchor.indexOf(">") + 1, anchor.lastIndexOf("<"));
      const title = decodeEntities(inner.replace(/<[^>]*>/g, "")).trim();
      const tagsAttr = attr(openTag, "TAGS");
      out.push({
        url: href.trim(),
        title,
        folder: stack.filter(Boolean).join(" / ") || "Bookmarks",
        addDate: parseAddDate(attr(openTag, "ADD_DATE")),
        tags: tagsAttr ? tagsAttr.split(/[,\s]+/).filter(Boolean) : [],
      });
    }
  }
  return out;
}

export function parseAddDate(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  if (raw.trim().length >= 14) {
    const d = new Date(raw.trim());
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  return n < 1e11 ? n * 1000 : n;
}

export function parseUrlList(text: string): string[] {
  return text
    .split(/[\s,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ImportOptions {
  now: number;
  libraryId?: string;
}

export interface NewLink extends SalvageLink {}

export function toLink(b: { url: string; title?: string; folder?: string; addDate?: number | null; tags?: string[] }, opts: ImportOptions): NewLink | null {
  const canon = canonicalUrl(b.url);
  if (!canon || !isHttpish(canon)) return null;
  const key = dedupeKey(canon);
  return {
    id: hashId(key),
    url: canon,
    title: (b.title ?? "").trim() || titleFromUrl(canon),
    folder: b.folder?.trim() || "Imported",
    domain: domainOf(canon),
    dedupeKey: key,
    addDate: b.addDate ?? null,
    importedAt: opts.now,
    status: "pile",
    kept: false,
    note: "",
    openCount: 0,
    lastOpenedAt: null,
    deckCount: 0,
    lastDeckAt: null,
    snoozedUntil: null,
    tags: b.tags ?? [],
  };
}

export function toLinks(list: { url: string; title?: string; folder?: string; addDate?: number | null; tags?: string[] }[], opts: ImportOptions): { links: NewLink[]; skipped: number; invalid: number } {
  const seen = new Set<string>();
  const links: NewLink[] = [];
  let skipped = 0;
  let invalid = 0;
  for (const item of list) {
    const link = toLink(item, opts);
    if (!link) {
      invalid++;
      continue;
    }
    if (seen.has(link.dedupeKey)) {
      skipped++;
      continue;
    }
    seen.add(link.dedupeKey);
    links.push(link);
  }
  return { links, skipped, invalid };
}

export function findDuplicateGroups(links: SalvageLink[]): Map<string, SalvageLink[]> {
  const groups = new Map<string, SalvageLink[]>();
  for (const l of links) {
    const g = groups.get(l.dedupeKey);
    if (g) g.push(l);
    else groups.set(l.dedupeKey, [l]);
  }
  for (const [k, v] of [...groups]) if (v.length < 2) groups.delete(k);
  return groups;
}

export function nearDuplicateTitleGroups(links: SalvageLink[]): Map<string, SalvageLink[]> {
  const groups = new Map<string, SalvageLink[]>();
  for (const l of links) {
    if (!l.title) continue;
    const k = l.title.toLowerCase().replace(/\s+/g, " ").trim();
    const g = groups.get(k);
    if (g) g.push(l);
    else groups.set(k, [l]);
  }
  for (const [k, v] of [...groups]) if (v.length < 2) groups.delete(k);
  return groups;
}
