import type { SalvageLink } from "./model.ts";
import { humanAge } from "./stats.ts";

const DAY = 86_400_000;

export interface Snapshot {
  app: "salvage";
  version: 1;
  exportedAt: string;
  libraryId: string;
  links: SalvageLink[];
}

export function toJson(links: SalvageLink[], libraryId: string, now: number): string {
  const snap: Snapshot = { app: "salvage", version: 1, exportedAt: new Date(now).toISOString(), libraryId, links };
  return JSON.stringify(snap, null, 2);
}

export function fromJson(text: string): SalvageLink[] {
  const parsed = JSON.parse(text) as Partial<Snapshot>;
  if (!parsed || parsed.app !== "salvage" || !Array.isArray(parsed.links)) {
    throw new Error("Not a Salvage JSON export (missing app:'salvage' or links[]).");
  }
  return parsed.links as SalvageLink[];
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(links: SalvageLink[]): string {
  const header = ["title", "url", "folder", "domain", "status", "kept", "savedDate", "age", "opens", "lastOpened", "tags", "note", "deckCount", "dedupeKey"];
  const rows = links.map((l) =>
    [
      csvCell(l.title),
      csvCell(l.url),
      csvCell(l.folder),
      csvCell(l.domain),
      csvCell(l.status),
      csvCell(l.kept ? "yes" : "no"),
      csvCell(l.addDate ? new Date(l.addDate).toISOString().slice(0, 10) : ""),
      csvCell(l.addDate ? humanAge(l.addDate, Date.now()) : ""),
      csvCell(l.openCount),
      csvCell(l.lastOpenedAt ? new Date(l.lastOpenedAt).toISOString().slice(0, 10) : ""),
      csvCell(l.tags.join("|")),
      csvCell(l.note),
      csvCell(l.deckCount),
      csvCell(l.dedupeKey),
    ].join(","),
  );
  return [header.join(","), ...rows].join("\r\n") + "\r\n";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Round-trips through parseBookmarksHtml(): covered by tests. */
export function toBookmarksHtml(links: SalvageLink[], now: number): string {
  const byFolder = new Map<string, SalvageLink[]>();
  for (const l of links) {
    const f = l.folder || "Bookmarks";
    const arr = byFolder.get(f);
    if (arr) arr.push(l);
    else byFolder.set(f, [l]);
  }
  const out: string[] = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    `<!-- Salvage export ${new Date(now).toISOString()} — status kept=${links.filter((l) => l.kept).length} queued=${links.filter((l) => l.status === "queued").length} tossed=${links.filter((l) => l.status === "tossed").length} -->`,
    "<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">",
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
  ];
  for (const [folder, items] of [...byFolder].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`    <DT><H3 ADD_DATE="${Math.round(now / 1000)}" LAST_MODIFIED="${Math.round(now / 1000)}">${esc(folder)}</H3>`);
    out.push("    <DL><p>");
    for (const l of items.sort((a, b) => (a.addDate ?? 0) - (b.addDate ?? 0))) {
      const add = Math.round((l.addDate ?? l.importedAt) / 1000);
      const tags = l.tags.length ? ` TAGS="${esc(l.tags.join(","))}"` : "";
      const note = l.note ? ` DESCRIPTION="${esc(l.note)}"` : "";
      out.push(`        <DT><A HREF="${esc(l.url)}" ADD_DATE="${add}" LAST_visit="${l.openCount}"${tags}${note}>${esc(l.title)}</A>`);
    }
    out.push("    </DL><p>");
  }
  out.push("</DL><p>");
  return out.join("\n") + "\n";
}

export function describeLibrary(links: SalvageLink[], now: number): string {
  const years = links.filter((l) => l.addDate !== null && now - (l.addDate ?? 0) > 365 * DAY).length;
  return `${links.length} links, ${years} of them older than a year`;
}

export function download(filename: string, mime: string, data: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
