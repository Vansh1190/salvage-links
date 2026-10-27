import type { SalvageLink } from "./model.ts";
import { hashString, mulberry32 } from "./hash.ts";

export interface DeckInput {
  links: SalvageLink[];
  now: number;
  deckSize: number;
  dateKey: string;
  libraryId?: string;
  recencyWindowMs?: number;
}

export interface DeckPick {
  linkId: string;
  score: number;
  reasons: string[];
  components: Record<string, number>;
}

const DAY = 86_400_000;
const WEIGHTS = {
  domainAffinity: 3,
  folderAffinity: 1.5,
  neverOpened: 2,
  age: 2,
  unshown: 1,
  tossPenalty: -2.5,
  recentDeckPenalty: -3,
  snooze: -Infinity,
  jitter: 0.35,
};

export function dateKeyOf(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function affinityMaps(links: SalvageLink[], now: number, windowMs: number) {
  const domainScore = new Map<string, number>();
  const folderScore = new Map<string, number>();
  const tossed = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const l of links) {
    const recency = l.lastOpenedAt === null ? 0 : Math.max(0, 1 - (now - l.lastOpenedAt) / windowMs);
    if (l.openCount > 0) {
      const w = l.openCount * (0.4 + 0.6 * recency);
      domainScore.set(l.domain, (domainScore.get(l.domain) ?? 0) + w);
    }
    if (l.kept) {
      domainScore.set(l.domain, (domainScore.get(l.domain) ?? 0) + 1.5);
      folderScore.set(l.folder, (folderScore.get(l.folder) ?? 0) + 1.5);
    }
    if (l.status === "tossed") {
      tossed.set(l.domain, (tossed.get(l.domain) ?? 0) + 1);
      seen.set(l.domain, (seen.get(l.domain) ?? 0) + 1);
    } else if (l.openCount > 0 || l.kept || l.status === "done") {
      seen.set(l.domain, (seen.get(l.domain) ?? 0) + 1);
    }
  }
  return { domainScore, folderScore, tossed, seen };
}

export function explainAge(addDate: number | null, now: number): string | null {
  if (addDate === null) return null;
  const days = Math.max(0, Math.round((now - addDate) / DAY));
  if (days < 45) return null;
  if (days < 365) return `saved ${days} days ago`;
  const years = (days / 365).toFixed(days < 730 ? 1 : 0);
  return `saved ${years} years ago`;
}

export interface ScoredLink {
  score: number;
  reasons: string[];
  components: Record<string, number>;
}

export function scoreLink(link: SalvageLink, ctx: ReturnType<typeof affinityMaps>, now: number, windowMs: number): ScoredLink {
  const components: Record<string, number> = {};
  const reasons: string[] = [];

  if (link.snoozedUntil !== null && link.snoozedUntil > now) {
    return { score: -Infinity, reasons: ["snoozed"], components: { snooze: -Infinity } };
  }
  components.snooze = 0;

  const dAff = ctx.domainScore.get(link.domain) ?? 0;
  const domainNorm = Math.min(1, dAff / 6);
  components.domainAffinity = WEIGHTS.domainAffinity * domainNorm;
  if (domainNorm > 0.15) {
    reasons.push(`you open ${link.domain || "this site"} a lot`);
  }

  const fAff = ctx.folderScore.get(link.folder) ?? 0;
  const folderNorm = Math.min(1, fAff / 6);
  components.folderAffinity = WEIGHTS.folderAffinity * folderNorm;
  if (folderNorm > 0.2 && link.folder) reasons.push(`same folder as things you kept (${link.folder})`);

  if (link.openCount === 0) {
    components.neverOpened = WEIGHTS.neverOpened;
    reasons.push("you have never opened it");
  } else components.neverOpened = 0;

  const anchor = link.addDate ?? link.importedAt;
  const ageDays = Math.max(0, (now - anchor) / DAY);
  const ageNorm = Math.min(1, ageDays / (3 * 365));
  components.age = WEIGHTS.age * ageNorm;
  const ageReason = explainAge(link.addDate, now);
  if (ageReason) reasons.push(ageReason);

  if (link.deckCount === 0) {
    components.unshown = WEIGHTS.unshown;
    reasons.push("never surfaced before");
  } else {
    components.unshown = WEIGHTS.unshown * Math.min(1, link.deckCount / 4) * 0.2;
  }

  const recentDeck = link.lastDeckAt === null ? 0 : Math.max(0, 1 - (now - link.lastDeckAt) / (30 * DAY));
  components.recentDeckPenalty = WEIGHTS.recentDeckPenalty * recentDeck;
  if (recentDeck > 0.5) reasons.push("shown recently, pushed down");

  const tossedN = ctx.tossed.get(link.domain) ?? 0;
  const seenN = ctx.seen.get(link.domain) ?? 0;
  const tossRatio = seenN > 0 ? tossedN / seenN : 0;
  components.tossPenalty = WEIGHTS.tossPenalty * tossRatio * Math.min(1, tossedN / 2);
  if (tossRatio > 0.3 && tossedN >= 2) reasons.push(`you tossed ${tossedN} from ${link.domain || "this site"} — shown less`);

  const sum = Object.entries(components)
    .filter(([k]) => k !== "snooze")
    .reduce((acc, [, v]) => acc + v, 0);
  void windowMs;
  return { score: sum, reasons, components };
}

/**
 * Deterministic per (dateKey, libraryId, library contents): calling twice on the same
 * day with the same data returns the same deck. That is what makes "today's deck" honest.
 */
export function buildDeck(input: DeckInput): DeckPick[] {
  const { links, now, deckSize, dateKey } = input;
  if (deckSize <= 0) return [];
  const windowMs = input.recencyWindowMs ?? 180 * DAY;
  const ctx = affinityMaps(links, now, windowMs);
  const candidates = links.filter((l) => l.status === "pile" && !(l.snoozedUntil !== null && l.snoozedUntil > now));
  if (!candidates.length) return [];

  const rand = mulberry32(hashString(`${dateKey}|${input.libraryId ?? "default"}|${candidates.length}`));
  const scored = candidates.map((l) => {
    const { score, reasons, components } = scoreLink(l, ctx, now, windowMs);
    const jitter = (rand() - 0.5) * 2 * WEIGHTS.jitter;
    return { link: l, score: score + jitter, reasons, components: { ...components, jitter } };
  });
  scored.sort((a, b) => b.score - a.score || a.link.id.localeCompare(b.link.id));

  const picks: DeckPick[] = scored.slice(0, deckSize).map((s) => ({
    linkId: s.link.id,
    score: Math.round(s.score * 1000) / 1000,
    reasons: s.reasons,
    components: s.components,
  }));

  const oldest = candidates
    .filter((l) => l.openCount === 0 && l.addDate !== null)
    .sort((a, b) => (a.addDate ?? 0) - (b.addDate ?? 0))[0];
  if (oldest && picks.length >= deckSize && !picks.some((p) => p.linkId === oldest.id)) {
    const scoredOldest = scoreLink(oldest, ctx, now, windowMs);
    picks[picks.length - 1] = {
      linkId: oldest.id,
      score: Math.round(scoredOldest.score * 1000) / 1000,
      reasons: [...scoredOldest.reasons, "the oldest thing you never opened"],
      components: { ...scoredOldest.components, oldestGuarantee: 1 },
    };
  }
  return picks;
}
