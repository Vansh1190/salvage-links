import type { SalvageLink } from "./model.ts";

const HAS_SEGMENTER = typeof Intl !== "undefined" && "Segmenter" in Intl;
let segmenter: Intl.Segmenter | null = null;

function words(text: string): string[] {
  if (HAS_SEGMENTER) {
    segmenter ??= new Intl.Segmenter(undefined, { granularity: "word" });
    const out: string[] = [];
    for (const s of segmenter.segment(text.toLowerCase())) {
      if (s.isWordLike) out.push(s.segment);
    }
    return out;
  }
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export interface SearchIndex {
  count: number;
  avgLen: number;
  docTokens: Map<string, Map<string, number>>;
  postings: Map<string, Set<string>>;
  docLen: Map<string, number>;
}

export function docText(l: SalvageLink): string {
  return `${l.title} ${l.folder} ${l.domain} ${l.url} ${l.tags.join(" ")} ${l.note}`;
}

export function buildIndex(links: SalvageLink[]): SearchIndex {
  const postings = new Map<string, Set<string>>();
  const docTokens = new Map<string, Map<string, number>>();
  const docLen = new Map<string, number>();
  let total = 0;
  for (const l of links) {
    const toks = words(docText(l));
    const counts = new Map<string, number>();
    for (const t of toks) counts.set(t, (counts.get(t) ?? 0) + 1);
    docTokens.set(l.id, counts);
    docLen.set(l.id, toks.length);
    total += toks.length;
    for (const t of counts.keys()) {
      let set = postings.get(t);
      if (!set) postings.set(t, (set = new Set()));
      set.add(l.id);
    }
  }
  return { count: links.length, avgLen: links.length ? total / links.length : 0, docTokens, postings, docLen };
}

const K1 = 1.4;
const B = 0.75;

export function search(index: SearchIndex, query: string, limit = 50): { id: string; score: number }[] {
  const q = [...new Set(words(query))];
  if (!q.length || index.count === 0) return [];
  const scores = new Map<string, number>();
  for (const term of q) {
    const df = index.postings.get(term)?.size ?? 0;
    if (!df) continue;
    const idf = Math.log(1 + (index.count - df + 0.5) / (df + 0.5));
    for (const id of index.postings.get(term)!) {
      const tf = index.docTokens.get(id)?.get(term) ?? 0;
      const len = index.docLen.get(id) ?? 1;
      const denom = tf + K1 * (1 - B + B * (len / (index.avgLen || 1)));
      scores.set(id, (scores.get(id) ?? 0) + idf * ((tf * (K1 + 1)) / denom));
    }
  }
  return [...scores]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id, score]) => ({ id, score: Math.round(score * 1000) / 1000 }));
}

export function highlight(text: string, query: string, max = 120): string {
  const terms = [...new Set(words(query))].filter((t) => t.length > 1);
  if (!terms.length) return text.slice(0, max);
  const lower = text.toLowerCase();
  const idx = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (idx === undefined) return text.slice(0, max);
  const start = Math.max(0, idx - 40);
  return (start > 0 ? "…" : "") + text.slice(start, start + max);
}
