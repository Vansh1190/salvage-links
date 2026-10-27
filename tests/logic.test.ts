import { describe, expect, it } from "vitest";
import { buildDeck, dateKeyOf, explainAge, scoreLink } from "../src/resurfacer.ts";
import { buildIndex, search } from "../src/search.ts";
import { computePulse, formatBytes, humanAge, recomputeStreak } from "../src/stats.ts";
import { DEFAULT_SETTINGS } from "../src/model.ts";
import { FREE_LINK_LIMIT, PRO_CAPABILITIES, ensureTrialStarted, getEntitlement, has, trialProgress } from "../src/trial.ts";
import { DAY, makeLink } from "./helpers.ts";

const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);

function affinity(links: ReturnType<typeof makeLink>[]) {
  return buildDeck({ links, now: NOW, deckSize: 5, dateKey: dateKeyOf(NOW), libraryId: "test" });
}

describe("resurfacer", () => {
  it("is deterministic for the same day and library, different for another day", () => {
    const links = Array.from({ length: 40 }, (_, i) => makeLink({ url: `https://site${i % 5}.com/p${i}` }));
    const a = affinity(links).map((p) => p.linkId);
    const b = affinity(links).map((p) => p.linkId);
    const otherDay = buildDeck({ links, now: NOW, deckSize: 5, dateKey: "2026-10-28", libraryId: "test" }).map((p) => p.linkId);
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
    expect(new Set(otherDay).size).toBe(5);
  });

  it("returns nothing for an empty library and shrinks when the pool is small", () => {
    expect(affinity([])).toEqual([]);
    const two = [makeLink({ url: "https://a.com/1" }), makeLink({ url: "https://a.com/2" })];
    expect(affinity(two)).toHaveLength(2);
  });

  it("never surfaces triaged, done or tossed links", () => {
    const links = [
      makeLink({ url: "https://a.com/1", status: "queued" }),
      makeLink({ url: "https://a.com/2", status: "done" }),
      makeLink({ url: "https://a.com/3", status: "tossed" }),
      makeLink({ url: "https://a.com/4", status: "pile" }),
    ];
    const picks = affinity(links);
    expect(picks.map((p) => p.linkId)).toEqual([links[3].id]);
  });

  it("honours snooze, then lets the link back", () => {
    const snoozed = makeLink({ url: "https://a.com/1", snoozedUntil: NOW + DAY });
    expect(affinity([snoozed])).toEqual([]);
    const awake = makeLink({ url: "https://a.com/2", snoozedUntil: NOW - DAY });
    expect(affinity([awake]).map((p) => p.linkId)).toEqual([awake.id]);
  });

  it("prefers a domain the user actually opens, all else equal", () => {
    const liked = Array.from({ length: 3 }, (_, i) => makeLink({ url: `https://news.ycombinator.com/item${i}`, addDate: null }));
    const ignored = Array.from({ length: 3 }, (_, i) => makeLink({ url: `https://oddblog.example/p${i}`, addDate: null }));
    liked[0].openCount = 6;
    liked[0].lastOpenedAt = NOW - 2 * DAY;
    const picks = affinity([...ignored, ...liked]);
    expect(picks.some((p) => p.linkId === liked[0].id)).toBe(true);
    const scored = scoreLink(liked[0], { domainScore: new Map([["news.ycombinator.com", 6]]), folderScore: new Map(), tossed: new Map(), seen: new Map() } as never, NOW, 180 * DAY);
    expect(scored.components.domainAffinity).toBeGreaterThan(0);
    expect(picks[0].reasons.length).toBeGreaterThan(0);
  });

  it("pushes down domains the user keeps tossing", () => {
    const spam = Array.from({ length: 4 }, (_, i) => makeLink({ url: `https://listicle.example/p${i}`, status: "tossed", addDate: null }));
    const good = makeLink({ url: "https://docs.example/guide", addDate: null });
    const picks = affinity([...spam, good]);
    expect(picks.map((p) => p.linkId)).toEqual([good.id]);
  });

  it("guarantees the oldest never-opened save appears in a full deck even when it would not rank", () => {
    const old = makeLink({ url: "https://ancient.example/from-2015", addDate: NOW - 9 * 365 * DAY });
    const rejected = Array.from({ length: 5 }, (_, i) => makeLink({ url: `https://ancient.example/junk${i}`, addDate: NOW - 9 * 365 * DAY, status: "tossed" }));
    const fresh = Array.from({ length: 14 }, (_, i) => makeLink({ url: `https://hot.example/${i}`, addDate: NOW - 60 * DAY, openCount: 9, lastOpenedAt: NOW - DAY }));
    const withoutOld = buildDeck({ links: [...rejected, ...fresh], now: NOW, deckSize: 5, dateKey: dateKeyOf(NOW), libraryId: "test" }).map((p) => p.linkId);
    expect(withoutOld).not.toContain(old.id);
    const picks = affinity([old, ...rejected, ...fresh]);
    expect(picks).toHaveLength(5);
    expect(picks.some((p) => p.linkId === old.id)).toBe(true);
    expect(picks.find((p) => p.linkId === old.id)?.reasons).toContain("the oldest thing you never opened");
  });

  it("never puts the same link in a deck twice, on any day", () => {
    const links = Array.from({ length: 60 }, (_, i) => makeLink({ url: `https://site${i % 5}.com/p${i}` }));
    for (const day of ["2026-10-27", "2026-10-28", "2026-11-02"]) {
      const ids = buildDeck({ links, now: NOW, deckSize: 8, dateKey: day, libraryId: "test" }).map((p) => p.linkId);
      expect(ids).toHaveLength(8);
      expect(new Set(ids).size).toBe(8);
    }
  });

  it("explains ages honestly and stays quiet about recent saves", () => {
    expect(explainAge(NOW - 10 * DAY, NOW)).toBeNull();
    expect(explainAge(NOW - 100 * DAY, NOW)).toBe("saved 100 days ago");
    expect(explainAge(NOW - 800 * DAY, NOW)).toBe("saved 2 years ago");
    expect(explainAge(null, NOW)).toBeNull();
  });

  it("dateKeyOf uses the local calendar day", () => {
    expect(dateKeyOf(new Date(2026, 0, 5, 23, 59).getTime())).toBe("2026-01-05");
    expect(dateKeyOf(new Date(2026, 10, 1, 0, 1).getTime())).toBe("2026-11-01");
  });
});

describe("search", () => {
  const links = [
    makeLink({ url: "https://a.com/1", title: "Postgres locking and MVCC", folder: "db" }),
    makeLink({ url: "https://b.com/2", title: "Weekly grocery list", note: "postgres cheatsheet linked from slack" }),
    makeLink({ url: "https://rust-lang.github.io/cargo", title: "Cargo book" }),
  ];
  const index = buildIndex(links);

  it("ranks a title hit above a note-only hit", () => {
    const hits = search(index, "postgres").map((r) => r.id);
    expect(hits[0]).toBe(links[0].id);
    expect(hits).toContain(links[1].id);
  });
  it("finds things by domain and folder", () => {
    expect(search(index, "cargo")[0].id).toBe(links[2].id);
    expect(search(index, "db").map((r) => r.id)).toContain(links[0].id);
  });
  it("returns nothing for a nonsense term or an empty query, without throwing", () => {
    expect(search(index, "")).toEqual([]);
    expect(search(index, "   ")).toEqual([]);
    expect(search(index, "zzqqxx")).toEqual([]);
    expect(search(buildIndex([]), "anything")).toEqual([]);
  });
  it("intersects multiple terms", () => {
    expect(search(index, "grocery list").map((r) => r.id)[0]).toBe(links[1].id);
  });
});

describe("trial / entitlement", () => {
  const base = { ...DEFAULT_SETTINGS };
  it("does not start until the first import, and grants Pro meanwhile", () => {
    const e = getEntitlement(base, NOW);
    expect(e.plan).toBe("free");
    expect(e.proActive).toBe(true);
    expect(e.reason).toMatch(/not started/i);
  });
  it("counts down from first run", () => {
    const s = { ...base, firstRunAt: NOW - 20 * DAY };
    const e = getEntitlement(s, NOW);
    expect(e.plan).toBe("pro-trial");
    expect(e.daysLeft).toBe(20);
    expect(e.proActive).toBe(true);
    expect(e.deckSize).toBe(20);
  });
  it("expires exactly at day 40 and applies the free limits", () => {
    const s = { ...base, firstRunAt: NOW - 40 * DAY };
    const e = getEntitlement(s, NOW);
    expect(e.plan).toBe("pro-expired");
    expect(e.proActive).toBe(false);
    expect(e.linkLimit).toBe(FREE_LINK_LIMIT);
    expect(e.deckSize).toBe(5);
  });
  it("keeps browsing/search/export free forever and locks only Pro caps", () => {
    const expired = getEntitlement({ ...base, firstRunAt: NOW - 60 * DAY }, NOW);
    for (const cap of ["deck", "search", "import", "export-json", "export-html"] as const) expect(has(cap, expired)).toBe(true);
    for (const cap of PRO_CAPABILITIES) expect(has(cap, expired)).toBe(false);
    const active = getEntitlement({ ...base, firstRunAt: NOW - 1 * DAY }, NOW);
    for (const cap of PRO_CAPABILITIES) expect(has(cap, active)).toBe(true);
  });
  it("starts the trial exactly once", () => {
    const first = ensureTrialStarted(base, NOW);
    expect(first.started).toBe(true);
    expect(first.settings.firstRunAt).toBe(NOW);
    const second = ensureTrialStarted(first.settings, NOW + DAY);
    expect(second.started).toBe(false);
    expect(second.settings.firstRunAt).toBe(NOW);
  });
  it("reports trial progress between 0 and 1", () => {
    expect(trialProgress(base, NOW)).toBe(0);
    expect(trialProgress({ ...base, firstRunAt: NOW - 20 * DAY }, NOW)).toBeCloseTo(0.5);
    expect(trialProgress({ ...base, firstRunAt: NOW - 900 * DAY }, NOW)).toBe(1);
  });
});

describe("pulse + streak", () => {
  const links = [
    makeLink({ url: "https://a.com/1", status: "pile", openCount: 0 }),
    makeLink({ url: "https://a.com/2", status: "queued", kept: true }),
    makeLink({ url: "https://b.com/3", status: "done" }),
    makeLink({ url: "https://b.com/4", status: "tossed" }),
    makeLink({ url: "https://c.com/5", status: "pile", addDate: NOW - 1000 * DAY }),
  ];
  links[1].dedupeKey = links[0].dedupeKey;

  it("counts every status bucket and the progress share", () => {
    const p = computePulse(links, [], NOW, 0);
    expect(p.total).toBe(5);
    expect(p.pile).toBe(2);
    expect(p.queued).toBe(1);
    expect(p.done).toBe(1);
    expect(p.tossed).toBe(1);
    expect(p.kept).toBe(1);
    expect(p.neverOpenedPile).toBe(2);
    expect(p.progressPct).toBe(40);
    expect(p.oldestSaved).toBe(NOW - 1000 * DAY);
    expect(p.duplicateGroups).toBe(1);
    expect(p.topDomains[0].count).toBe(2);
    expect(p.byFolder).toHaveLength(1);
  });
  it("separates salvages this week from all time", () => {
    const events = [
      { ts: NOW - 2 * DAY, type: "keep" as const, linkId: "a" },
      { ts: NOW - 20 * DAY, type: "toss" as const, linkId: "b" },
      { ts: NOW - 3 * DAY, type: "queue-done" as const, linkId: "c" },
      { ts: NOW - 4 * DAY, type: "open" as const, linkId: "d" },
      { ts: NOW - 5 * DAY, type: "import" as const, count: 10 },
    ];
    const p = computePulse(links, events, NOW, 0);
    expect(p.salvagedTotal).toBe(3);
    expect(p.salvaged7d).toBe(2);
  });
  it("builds a streak over consecutive days and drops it after a gap", () => {
    const events = [
      { ts: NOW - 0 * DAY, type: "deck-shown" as const },
      { ts: NOW - 1 * DAY, type: "keep" as const },
      { ts: NOW - 2 * DAY, type: "toss" as const },
      { ts: NOW - 5 * DAY, type: "keep" as const },
    ];
    expect(recomputeStreak(events, dateKeyOf(NOW), dateKeyOf(NOW - 1 * DAY))).toBe(3);
    const gapped = events.filter((e) => e.ts !== NOW - 1 * DAY);
    expect(recomputeStreak(gapped, dateKeyOf(NOW), dateKeyOf(NOW - 1 * DAY))).toBe(1);
    expect(recomputeStreak([], dateKeyOf(NOW), null)).toBe(0);
  });
  it("formats ages and bytes without going negative or NaN", () => {
    expect(humanAge(null, NOW)).toBe("unknown date");
    expect(humanAge(NOW, NOW)).toBe("today");
    expect(humanAge(NOW - 3 * DAY, NOW)).toBe("3d ago");
    expect(humanAge(NOW - 400 * DAY, NOW)).toContain("y ago");
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024 * 1500)).toBe("1.5 MB");
  });
});
