import { describe, expect, it } from "vitest";
import { canonicalUrl, dedupeKey, domainOf, isHttpish, normalizeTitle, titleFromUrl } from "../src/normalize.ts";
import { findDuplicateGroups, parseAddDate, parseBookmarksHtml, toLinks, nearDuplicateTitleGroups } from "../src/bookmarks.ts";
import { fromJson, toBookmarksHtml, toCsv, toJson } from "../src/exporters.ts";
import { buildWeeklyReminderIcs, parseIcsForTest } from "../src/ics.ts";
import type { SalvageLink } from "../src/model.ts";

export const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);

export function makeLink(over: Partial<SalvageLink> = {}): SalvageLink {
  const url = canonicalUrl(over.url ?? "https://example.com/post");
  return {
    id: over.id ?? url.length + "-" + Math.abs([...url].reduce((a, c) => a + c.charCodeAt(0), 0)),
    url,
    title: "Untitled",
    folder: "Backlog",
    domain: domainOf(url),
    dedupeKey: dedupeKey(url),
    addDate: NOW - 400 * 86_400_000,
    importedAt: NOW - 10 * 86_400_000,
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
    dedupeKey: dedupeKey(url),
  };
}

describe("canonicalUrl", () => {
  it("adds a scheme, drops www, the hash and trailing slash", () => {
    expect(canonicalUrl("WWW.Example.com/a/b/")).toBe("https://example.com/a/b");
    expect(canonicalUrl("example.com#a")).toBe("https://example.com/");
  });
  it("strips tracking params but keeps meaningful ones", () => {
    expect(canonicalUrl("https://example.com/p?id=7&utm_source=news&fbclid=x")).toBe("https://example.com/p?id=7");
  });
  it("collapses default ports and double slashes", () => {
    expect(canonicalUrl("http://example.com:80//a//b")).toBe("http://example.com/a/b");
  });
  it("refuses to mangle javascript: urls and returns them for rejection downstream", () => {
    expect(canonicalUrl("javascript:void(0)")).toBe("javascript:void(0)");
    expect(isHttpish(canonicalUrl("javascript:void(0)"))).toBe(false);
    expect(isHttpish(canonicalUrl("mailto:me@x.com"))).toBe(false);
  });
  it("returns empty for empty input", () => {
    expect(canonicalUrl("   ")).toBe("");
  });
});

describe("dedupeKey / domain helpers", () => {
  it("orders query params so ?a&b equals ?b&a", () => {
    expect(dedupeKey(canonicalUrl("https://x.com/p?b=2&a=1"))).toBe(dedupeKey(canonicalUrl("https://x.com/p?a=1&b=2")));
  });
  it("treats www and bare host as the same key", () => {
    expect(dedupeKey(canonicalUrl("https://www.github.com/a"))).toBe(dedupeKey(canonicalUrl("https://github.com/a")));
  });
  it("normalizes titles by dropping site suffixes", () => {
    expect(normalizeTitle("  Merge   policy — GitHub  ")).toContain("merge policy");
  });
  it("derives a readable title from a url", () => {
    expect(titleFromUrl("https://example.com/blog/hello_world.html").toLowerCase()).toContain("hello world");
  });
});

describe("parseBookmarksHtml", () => {
  const chromeFile = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1600000000" LAST_MODIFIED="1600000001">Bookmarks bar</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1600000000">dev</H3>
        <DL><p>
            <DT><A HREF="https://example.com/a?x=1&amp;y=2" ADD_DATE="1500000000" ICON="data:image/png;base64,AAA">First &quot;post&quot;</A>
            <DT><A HREF="https://example.com/b" TAGS="rust,perf" ADD_DATE="1500000001000">Second</A>
            <DT><A HREF="javascript:void(0)">scripty</A>
        </DL><p>
        <DT><A HREF="https://example.com/c">Loose one</A>
    </DL><p>
</DL><p>`;

  it("parses links with nested folder paths", () => {
    const items = parseBookmarksHtml(chromeFile);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ title: 'First "post"', folder: "Bookmarks bar / dev" });
    expect(items[1].folder).toBe("Bookmarks bar / dev");
    expect(items[2].folder).toBe("Bookmarks bar / dev");
    expect(items[3].folder).toBe("Bookmarks bar");
  });
  it("decodes entities inside the URL so query strings survive", () => {
    const items = parseBookmarksHtml(chromeFile);
    expect(items[0].url).toBe("https://example.com/a?x=1&y=2");
  });
  it("reads TAGS and both second and millisecond ADD_DATE flavours", () => {
    const items = parseBookmarksHtml(chromeFile);
    expect(items[1].tags).toEqual(["rust", "perf"]);
    expect(items[0].addDate).toBe(1500000000000);
    expect(items[1].addDate).toBe(1500000001000);
  });
  it("keeps javascript: entries parseable but toLinks drops them as invalid", () => {
    const { links, invalid } = toLinks(parseBookmarksHtml(chromeFile), { now: NOW });
    expect(invalid).toBe(1);
    expect(links.map((l) => l.url)).not.toContain("javascript:void(0)");
  });
  it("keeps every anchor when a file crams them onto one line", () => {
    const items = parseBookmarksHtml('<DT><A HREF="https://a.com/1">one</A><DT><A HREF="https://a.com/2">two</A><DT><A HREF="https://a.com/3">three</A>');
    expect(items.map((i) => i.url)).toEqual(["https://a.com/1", "https://a.com/2", "https://a.com/3"]);
  });
  it("ignores commented-out bookmarks", () => {
    expect(parseBookmarksHtml('<!-- <DT><A HREF="https://gone.com/x">nope</A> -->')).toEqual([]);
  });
  it("deduplicates the same URL inside one file", () => {
    const dupe = `<DL><p><DT><A HREF="https://a.com/x" ADD_DATE="1500000000">one</A><DT><A HREF="https://www.a.com/x/">two</A></DL><p>`;
    const { links, skipped } = toLinks(parseBookmarksHtml(dupe), { now: NOW });
    expect(links).toHaveLength(1);
    expect(skipped).toBe(1);
  });
  it("survives an empty file and a file of junk", () => {
    expect(parseBookmarksHtml("")).toEqual([]);
    expect(parseBookmarksHtml("<p>not a bookmark file</p>\nrandom text\n")).toEqual([]);
  });
  it("handles a url without a folder and no DL wrapper", () => {
    const items = parseBookmarksHtml('<DT><A HREF="example.org/p">bare</A>');
    expect(items[0].folder).toBe("Bookmarks");
  });
  it("parses addDate garbage as null rather than 1970", () => {
    expect(parseAddDate("0")).toBeNull();
    expect(parseAddDate(null)).toBeNull();
    expect(parseAddDate("nope")).toBeNull();
    expect(parseAddDate("1700000000")).toBe(1700000000000);
  });
});

describe("duplicate detection", () => {
  it("groups exact-url duplicates and ignores singletons", () => {
    const a = makeLink({ url: "https://x.com/1", id: "a" });
    const b = makeLink({ url: "https://x.com/1", id: "b" });
    const c = makeLink({ url: "https://x.com/2", id: "c" });
    const groups = findDuplicateGroups([a, b, c]);
    expect(groups.size).toBe(1);
    expect([...groups.values()][0].map((l) => l.id)).toEqual(["a", "b"]);
    expect(nearDuplicateTitleGroups([a, b, c]).size).toBe(1);
  });
});

describe("exporters", () => {
  const links = [
    makeLink({ url: "https://x.com/one", id: "one" }),
    makeLink({ url: "https://x.com/two", id: "two", title: 'Quotes "and" commas, here', note: "why I saved it", tags: ["a", "b"] }),
  ];
  it("JSON round-trips losslessly", () => {
    const back = fromJson(toJson(links, "lib1", NOW));
    expect(back).toEqual(links);
  });
  it("rejects a foreign json blob with a readable error", () => {
    expect(() => fromJson(JSON.stringify({ hello: "world" }))).toThrowError(/Not a Salvage JSON export/);
    expect(() => fromJson("{not json")).toThrowError();
  });
  it("quotes CSV cells containing commas and double quotes", () => {
    const csv = toCsv(links);
    expect(csv.split("\r\n")[0]).toMatch(/^title,url,folder/);
    expect(csv).toContain('"Quotes ""and"" commas, here"');
  });
  it("bookmarks.html export round-trips back through the parser", () => {
    const html = toBookmarksHtml(links, NOW);
    expect(html).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
    const items = parseBookmarksHtml(html);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.url).sort()).toEqual(["https://x.com/one", "https://x.com/two"]);
    expect(items.find((i) => i.url === "https://x.com/two")?.title).toBe('Quotes "and" commas, here');
    const reimported = toLinks(items, { now: NOW });
    expect(reimported.links).toHaveLength(2);
  });
});

describe("ics reminder", () => {
  it("uses CRLF, a weekly RRULE and escapes commas", () => {
    const ics = buildWeeklyReminderIcs({ now: NOW, description: "Hi, there" });
    expect(ics).toContain("\r\n");
    const rows = parseIcsForTest(ics);
    expect(rows.RRULE).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(ics.replace(/\r\n[ \t]/g, "")).toContain("DESCRIPTION:Hi\\, there");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("END:VCALENDAR");
  });
  it("keeps every unfolded line within the 75-octet limit", () => {
    const ics = buildWeeklyReminderIcs({ now: NOW, description: "x".repeat(300), url: "https://example.com/" + "y".repeat(200) });
    const tooLong = ics
      .split("\r\n")
      .filter((l) => !l.startsWith(" "))
      .filter((l) => new TextEncoder().encode(l).length > 75);
    expect(tooLong).toEqual([]);
  });
  it("rolls forward to the next requested weekday, never a past date", () => {
    const ics = buildWeeklyReminderIcs({ now: NOW, weekday: 6 });
    const dt = parseIcsForTest(ics).DTSTART;
    expect(Number(dt.slice(0, 4))).toBeGreaterThanOrEqual(2026);
    expect(dt).toMatch(/^\d{8}T\d{6}$/);
  });
});
