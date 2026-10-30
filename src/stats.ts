import type { SalvageEvent, SalvageLink } from "./model.ts";
import { dateKeyOf } from "./resurfacer.ts";

const DAY = 86_400_000;

export interface Pulse {
  total: number;
  pile: number;
  queued: number;
  done: number;
  tossed: number;
  kept: number;
  salvaged7d: number;
  progressPct: number;
  streakDays: number;
  oldestSaved: number | null;
  neverOpenedPile: number;
  /** Top 8, for the bars. */
  topDomains: { domain: string; count: number }[];
  /** Every folder, biggest first — the rename UI needs more than the top 8. */
  folders: { folder: string; count: number }[];
}

export function computePulse(links: SalvageLink[], events: SalvageEvent[], now: number, streak: number): Pulse {
  const counts = { pile: 0, queued: 0, done: 0, tossed: 0 };
  const domainCount = new Map<string, number>();
  const folderCount = new Map<string, number>();
  let kept = 0;
  let neverOpenedPile = 0;
  let oldest: number | null = null;
  for (const l of links) {
    counts[l.status]++;
    if (l.kept) kept++;
    if (l.status === "pile" && l.openCount === 0) neverOpenedPile++;
    const anchor = l.addDate;
    if (anchor !== null) {
      if (oldest === null || anchor < oldest) oldest = anchor;
    }

    if (l.domain) domainCount.set(l.domain, (domainCount.get(l.domain) ?? 0) + 1);
    const folder = l.folder || "(no folder)";
    folderCount.set(folder, (folderCount.get(folder) ?? 0) + 1);
  }
  const salvagedTypes = new Set(["keep", "toss", "queue-done"]);
  let salvaged7d = 0;
  for (const e of events) {
    if (!salvagedTypes.has(e.type)) continue;
    if (now - e.ts <= 7 * DAY) salvaged7d++;
  }
  const resolved = counts.done + counts.tossed;
  const folders = [...folderCount].sort((a, b) => b[1] - a[1]).map(([folder, count]) => ({ folder, count }));
  return {
    total: links.length,
    pile: counts.pile,
    queued: counts.queued,
    done: counts.done,
    tossed: counts.tossed,
    kept,
    salvaged7d,
    progressPct: links.length ? Math.round((resolved / links.length) * 1000) / 10 : 0,
    streakDays: streak,
    oldestSaved: oldest,
    neverOpenedPile,
    topDomains: [...domainCount].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([domain, count]) => ({ domain, count })),
    folders,
  };
}

/** A streak day counts when the user either saw a deck or triaged something. */
export function recomputeStreak(events: SalvageEvent[], todayKey: string, lastSeenDate: string | null): number {
  const activeDays = new Set<string>();
  for (const e of events) {
    if (e.type === "deck-shown" || e.type === "keep" || e.type === "toss" || e.type === "queue-done" || e.type === "open") {
      activeDays.add(dateKeyOf(e.ts));
    }
  }
  if (!activeDays.has(todayKey)) {
    if (!lastSeenDate || !activeDays.has(lastSeenDate)) return 0;
  }
  let streak = 0;
  let cursor = new Date(`${todayKey}T12:00:00`).getTime();
  if (!activeDays.has(todayKey)) cursor -= DAY;
  while (activeDays.has(dateKeyOf(cursor))) {
    streak++;
    cursor -= DAY;
  }
  return streak;
}

export function humanAge(ts: number | null, now: number): string {
  if (ts === null) return "unknown date";
  const days = Math.round((now - ts) / DAY);
  if (days < 1) return "today";
  if (days < 31) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  const years = days / 365;
  return `${years < 10 ? years.toFixed(1) : Math.round(years)}y ago`;
}

export function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
