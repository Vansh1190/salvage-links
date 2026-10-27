import { describe, expect, it } from "vitest";
import { sanitizeLink } from "../src/state.ts";
import { allowedDeckFor, FREE_LINK_LIMIT, getEntitlement, has } from "../src/trial.ts";
import { DEFAULT_SETTINGS } from "../src/model.ts";
import { DAY, makeLink } from "./helpers.ts";

const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
const expired = { ...DEFAULT_SETTINGS, firstRunAt: NOW - 60 * DAY, deckSize: 15 };
const active = { ...DEFAULT_SETTINGS, firstRunAt: NOW - 1 * DAY, deckSize: 15 };

describe("regressions found by the review pass", () => {
  it("never lets a restored file smuggle a script url into the library", () => {
    expect(sanitizeLink({ url: "javascript:alert(1)" }, NOW)).toBeNull();
    expect(sanitizeLink({ url: "data:text/html,<script>" }, NOW)).toBeNull();
    expect(sanitizeLink({ url: "not a url" }, NOW)).toBeNull();
    expect(sanitizeLink({ url: "" }, NOW)).toBeNull();
    expect(sanitizeLink(null, NOW)).toBeNull();
  });

  it("repairs a half-written link instead of rendering a crash later", () => {
    const fixed = sanitizeLink({ url: "https://a.com/x", status: "banana", openCount: Number.NaN, tags: "nope" as unknown as string[], note: 7 as unknown as string }, NOW);
    expect(fixed).not.toBeNull();
    expect(fixed?.status).toBe("pile");
    expect(fixed?.openCount).toBe(0);
    expect(fixed?.tags).toEqual([]);
    expect(fixed?.note).toBe("");
    expect(fixed?.title).toBe("x");
  });

  it("keeps its promise about the free deck size", () => {
    expect(allowedDeckFor(getEntitlement(active, NOW), 15)).toBe(15);
    expect(allowedDeckFor(getEntitlement(expired, NOW), 15)).toBe(5);
    expect(allowedDeckFor(getEntitlement(expired, NOW), 3)).toBe(3);
    expect(allowedDeckFor(getEntitlement(expired, NOW), 0)).toBe(1);
  });

  it("locks Pro tools and never locks the way out", () => {
    const e = getEntitlement(expired, NOW);
    expect(e.linkLimit).toBe(FREE_LINK_LIMIT);
    for (const cap of ["unlimited-library", "deck-size-choice", "dedupe", "bulk-cleanup", "notes", "export-csv", "ics-reminder"] as const) expect(has(cap, e)).toBe(false);
    for (const cap of ["deck", "search", "import", "export-json", "export-html"] as const) expect(has(cap, e)).toBe(true);
  });

  it("gives every link a stable id derived from its dedupe key", () => {
    const a = makeLink({ url: "https://example.com/same" });
    const b = sanitizeLink({ url: "https://www.example.com/same/" }, NOW)!;
    expect(b.dedupeKey).toBe(a.dedupeKey);
    expect(b.id).toBeTruthy();
  });
});
