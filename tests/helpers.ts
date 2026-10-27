import { canonicalUrl, dedupeKey, domainOf } from "../src/normalize.ts";
import { hashId } from "../src/hash.ts";
import type { SalvageLink } from "../src/model.ts";

export const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
export const DAY = 86_400_000;

export function makeLink(over: Partial<SalvageLink> = {}): SalvageLink {
  const url = canonicalUrl(over.url ?? `https://example.com/post-${Math.random().toString(36).slice(2)}`);
  const key = dedupeKey(url);
  return {
    id: hashId(key),
    title: "Untitled",
    folder: "Backlog",
    addDate: NOW - 400 * DAY,
    importedAt: NOW - 10 * DAY,
    status: "pile",
    kept: false,
    note: "",
    openCount: 0,
    lastOpenedAt: null,
    deckCount: 0,
    lastDeckAt: null,
    snoozedUntil: null,
    tags: [],
    ...over,
    url,
    domain: domainOf(url),
    dedupeKey: key,
  };
}

export function linkIdMap(links: SalvageLink[]): Map<string, SalvageLink> {
  return new Map(links.map((l) => [l.id, l]));
}
