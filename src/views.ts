import { announce, clear, dateLabel, h, relTime, shortHost } from "./dom.ts";
import { bulkTossDuplicates, canUndo, currentCard, currentReasons, deckPosition, importBookmarksHtml, importSnapshot, importUrlList, linkList, markDone, recordImport, recordImportError, renameFolder, resetAll, saveDeckSettings, setNote, setRoute, setStatus, state, triage, undo, type Route } from "./state.ts";
import { findDuplicateGroups, nearDuplicateTitleGroups } from "./bookmarks.ts";
import { buildIndex, search } from "./search.ts";
import { computePulse, formatBytes, humanAge } from "./stats.ts";
import { download, toBookmarksHtml, toCsv, toJson } from "./exporters.ts";
import { buildWeeklyReminderIcs } from "./ics.ts";
import { FREE_DECK_SIZE, PRO_CAPABILITIES, has, type Capability } from "./trial.ts";
import * as db from "./db.ts";
import type { SalvageLink } from "./model.ts";

let searchTimer = 0;

const NAV: { route: Route; label: string; key: string }[] = [
  { route: "deck", label: "Deck", key: "1" },
  { route: "queue", label: "Queue", key: "2" },
  { route: "library", label: "Library", key: "3" },
  { route: "pulse", label: "Pulse", key: "4" },
  { route: "import", label: "Import", key: "5" },
  { route: "settings", label: "Settings", key: "6" },
  { route: "limits", label: "Limits", key: "7" },
];

function reRender(): void {
  const app = document.getElementById("app");
  if (app) render(app);
}

function say(message: string): void {
  state.lastAction = message;
  reRender();
  announce(message);
}

function trialChip() {
  const e = state.entitlement;
  const total = state.settings.trialLengthDays || 40;
  if (e.plan === "pro-trial") {
    const day = Math.min(total, Math.max(1, total - (e.daysLeft ?? total) + 1));
    return h("span", { class: "chip chip-trial" }, `Trial day ${day} of ${total} · ${e.daysLeft} left`);
  }
  if (e.plan === "pro-expired") return h("span", { class: "chip chip-locked" }, "Trial ended · free plan");
  return h("span", { class: "chip" }, "Trial starts at first import");
}

function progressRow() {
  const pulse = computePulse(linkList(), state.events, state.now, state.settings.streakDays);
  if (!pulse.total) return null;
  return h(
    "div",
    { class: "progress-row" },
    h(
      "div",
      {
        class: "progress-track",
        role: "progressbar",
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        "aria-valuenow": String(pulse.progressPct),
        "aria-valuetext": `${pulse.progressPct}% decided: ${pulse.done} read, ${pulse.tossed} tossed`,
        "aria-label": "Share of library decided",
      },
      h("div", { class: "progress-fill", style: `width:${pulse.progressPct}%` }),
    ),
    h("span", { class: "progress-text" }, `${pulse.pile.toLocaleString()} in pile · ${pulse.done} read · ${pulse.tossed} tossed · ${pulse.streakDays}d streak`),
  );
}

function emptyDeck() {
  const links = linkList();
  const snoozed = links.filter((l) => l.snoozedUntil !== null && l.snoozedUntil > state.now).length;
  if (!links.length) {
    return h(
      "section",
      { class: "card empty", "aria-labelledby": "empty-h" },
      h("h2", { id: "empty-h" }, "Nothing here yet"),
      h("p", null, "Import the bookmarks you already have. Salvage keeps them on this device and deals a few forgotten ones back to you each day."),
      h("a", { class: "btn btn-primary", href: "#/import" }, "Import bookmarks"),
    );
  }
  return h(
    "section",
    { class: "card empty", "aria-labelledby": "empty-h" },
    h("h2", { id: "empty-h" }, "Deck cleared"),
    h("p", null, `Nothing left to deal today. ${snoozed} snoozed, ${computePulse(links, state.events, state.now, 0).queued} waiting in your queue.`),
    h("div", { class: "row" }, h("a", { class: "btn", href: "#/queue" }, "Open the queue"), h("a", { class: "btn", href: "#/import" }, "Add more links")),
  );
}

function deckActions() {
  const undoable = canUndo();
  return h(
    "div",
    { class: "actions actions-sub" },
    h(
      "button",
      { class: "btn btn-quiet", type: "button", "data-action": "undo", "data-focus-key": "undo", disabled: undoable ? undefined : true, onclick: () => void undo().then(announce) },
      h("span", null, "Undo"),
      h("kbd", null, "U"),
    ),
    h("span", { class: "action-feedback", "data-testid": "action-feedback" }, state.lastAction ?? (undoable ? `${state.undoStack.length} choice${state.undoStack.length === 1 ? "" : "s"} you can undo` : "Every choice here is reversible")),
  );
}

/** Focus follows the card, not every render. */
let focusedCardId: string | null = null;
function moveDeckFocus(root: HTMLElement): void {
  const card = currentCard();
  const id = card?.id ?? null;
  if (id === focusedCardId) return;
  focusedCardId = id;
  if (!id) {
    root.querySelector<HTMLElement>(".empty a, .empty .btn")?.focus({ preventScroll: true });
    return;
  }
  root.querySelector<HTMLElement>(".deck-title")?.focus({ preventScroll: true });
}

function deckView() {
  const card = currentCard();
  if (!card) return emptyDeck();
  const reasons = currentReasons();
  const pos = deckPosition();
  return h(
    "section",
    { class: "card deck", "aria-labelledby": "deck-h", "data-testid": "deck-card" },
    h("div", { class: "deck-head" }, h("h2", { id: "deck-h" }, "Today's deck"), h("span", { class: "muted", "data-testid": "deck-pos" }, `${pos.index} of ${pos.total}`)),
    h(
      "div",
      { class: "chips" },
      h("span", { class: "chip chip-host" }, shortHost(card.domain)),
      card.folder ? h("span", { class: "chip" }, card.folder) : null,
      card.addDate ? h("span", { class: "chip" }, `saved ${humanAge(card.addDate, state.now)}`) : h("span", { class: "chip" }, "no save date"),
      card.openCount > 0 ? h("span", { class: "chip" }, `opened ${card.openCount}×`) : h("span", { class: "chip chip-warn" }, "never opened"),
    ),
    h("h3", { class: "deck-title", tabindex: "-1" }, card.title),
    h("a", { class: "deck-url", href: card.url, target: "_blank", rel: "noopener noreferrer" }, card.url),
    reasons.length ? h("p", { class: "why" }, h("span", { class: "why-label" }, "Why now: "), reasons.join(" · ")) : null,
    h(
      "div",
      { class: "actions" },
      h("button", { class: "btn btn-primary", type: "button", "data-action": "open", onclick: () => void triage("open") }, h("span", null, "Open"), h("kbd", null, "O")),
      h("button", { class: "btn", type: "button", "data-action": "keep", onclick: () => void triage("keep") }, h("span", null, "Keep for reading"), h("kbd", null, "K")),
      h("button", { class: "btn", type: "button", "data-action": "snooze", onclick: () => void triage("snooze") }, h("span", null, `Snooze ${state.settings.snoozeDays}d`), h("kbd", null, "S")),
      h("button", { class: "btn btn-danger", type: "button", "data-action": "toss", onclick: () => void triage("toss") }, h("span", null, "Toss it"), h("kbd", null, "X")),
    ),
    deckActions(),
  );
}

function linkRow(l: SalvageLink) {
  const notesAllowed = has("notes", state.entitlement);
  const noteInput = h("input", {
    class: "note",
    type: "text",
    value: l.note,
    placeholder: notesAllowed ? "Note" : "Notes are a Pro tool",
    "aria-label": `Note for ${l.title}`,
    disabled: notesAllowed ? undefined : true,
    onchange: (e: Event) => void setNote(l.id, (e.target as HTMLInputElement).value),
  });
  return h(
    "li",
    { class: "link-row", "data-id": l.id },
    h(
      "div",
      { class: "link-main" },
      h("a", { class: "link-title", href: l.url, target: "_blank", rel: "noopener noreferrer" }, l.title),
      h(
        "div",
        { class: "link-meta" },
        h("span", { class: "chip chip-host" }, shortHost(l.domain)),
        h("span", { class: `chip chip-${l.status}` }, l.status),
        l.folder ? h("span", { class: "chip" }, l.folder) : null,
        h("span", { class: "muted small" }, l.addDate ? `saved ${dateLabel(l.addDate)} · ${relTime(l.addDate, state.now)}` : "no save date"),
        h("span", { class: "muted small" }, l.openCount > 0 ? `opened ${l.openCount}×` : "never opened"),
        l.snoozedUntil && l.snoozedUntil > state.now ? h("span", { class: "chip chip-warn" }, `back ${dateLabel(l.snoozedUntil)}`) : null,
      ),
    ),
    h(
      "div",
      { class: "link-actions" },
      h("button", { class: "btn btn-tiny", type: "button", "data-focus-key": `row:${l.id}:read`, title: "Opens in a new tab and marks it read", onclick: () => { window.open(l.url, "_blank", "noopener,noreferrer"); void markDone(l.id); } }, "Read"),
      l.status !== "done" ? h("button", { class: "btn btn-tiny", type: "button", "data-focus-key": `row:${l.id}:done`, onclick: () => void markDone(l.id) }, "Done") : null,
      l.status !== "tossed" ? h("button", { class: "btn btn-tiny", type: "button", "data-focus-key": `row:${l.id}:toss`, onclick: () => void setStatus(l.id, "tossed") }, "Toss") : h("button", { class: "btn btn-tiny", type: "button", "data-focus-key": `row:${l.id}:toss`, onclick: () => void setStatus(l.id, "pile") }, "Restore"),
      noteInput,
    ),
  );
}

function queueView() {
  const links = linkList()
    .filter((l) => l.status === "queued")
    .sort((a, b) => Number(b.kept) - Number(a.kept) || (a.lastOpenedAt ?? a.importedAt) - (b.lastOpenedAt ?? b.importedAt));
  const stale = links.filter((l) => state.now - (l.lastOpenedAt ?? l.importedAt) > 30 * 86_400_000);
  return h(
    "div",
    null,
    h(
      "div",
      { class: "row row-spread" },
      h("p", { class: "muted", "data-testid": "queue-count" }, `${links.length} waiting${stale.length ? ` · ${stale.length} untouched for a month` : ""}`),
      stale.length ? h("button", { class: "btn", type: "button", "data-focus-key": "return-stale", onclick: () => { for (const l of stale) void setStatus(l.id, "pile"); say(`Moved ${stale.length} stalled links back into the pile.`); } }, "Return stalled to the pile") : null,
    ),
    links.length ? h("ul", { class: "link-list" }, links.slice(0, 100).map((l) => linkRow(l))) : h("section", { class: "card" }, h("p", null, "Queue is empty. Press ", h("kbd", null, "K"), " on a card to send something here.")),
  );
}

let indexCache: { version: number; index: ReturnType<typeof buildIndex> } | null = null;
function indexFor(links: SalvageLink[]) {
  if (!indexCache || indexCache.version !== state.libraryVersion) indexCache = { version: state.libraryVersion, index: buildIndex(links) };
  return indexCache.index;
}

function libraryView() {
  const all = linkList();
  const resultsWrap = h("div", { "data-testid": "results-wrap" });
  const paint = () => {
    const q = state.query.trim();
    const found = q
      ? search(indexFor(all), q, 200).map((r) => state.links.get(r.id)).filter((l): l is SalvageLink => !!l)
      : all.slice().sort((a, b) => (b.addDate ?? b.importedAt) - (a.addDate ?? a.importedAt)).slice(0, 200);
    clear(resultsWrap);
    resultsWrap.append(
      h("p", { class: "muted", "data-testid": "library-count" }, q ? `${found.length} match${found.length === 1 ? "" : "es"} for “${q}” · ranked on this device, nothing sent anywhere` : `${all.length.toLocaleString()} links · newest 200 shown — search to reach the old ones`),
      found.length ? h("ul", { class: "link-list" }, found.map((l) => linkRow(l))) : h("p", { class: "muted" }, q ? `No match for “${q}”. Try one word, or the site name.` : "Library is empty."),
    );
  };
  const input = h("input", {
    id: "search-box",
    class: "search-box",
    type: "search",
    placeholder: "Search titles, folders, sites, notes",
    "aria-label": "Search library",
    value: state.query,
    oninput: (e: Event) => {
      state.query = (e.target as HTMLInputElement).value;
      if (searchTimer) window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(paint, 150);
    },
  });
  paint();
  return h("section", { class: "card", "aria-label": "Library" }, h("h2", null, "Library"), input, resultsWrap);
}

function pulseView() {
  const links = linkList();
  const p = computePulse(links, state.events, state.now, state.settings.streakDays);
  const dupes = findDuplicateGroups(links);
  const stats: [string, string][] = [
    ["In the pile", p.pile.toLocaleString()],
    ["Read", p.done.toLocaleString()],
    ["Tossed", p.tossed.toLocaleString()],
    ["Decided", `${p.progressPct}%`],
    ["Streak", `${p.streakDays} day${p.streakDays === 1 ? "" : "s"}`],
    ["Oldest save", p.oldestSaved ? `${humanAge(p.oldestSaved, state.now)} (${dateLabel(p.oldestSaved)})` : "unknown"],
  ];
  const maxDomain = p.topDomains[0]?.count ?? 1;
  return h(
    "div",
    null,
    h("section", { class: "card", "aria-label": "Numbers" }, h("h2", { "data-testid": "pulse-title" }, "Pulse"), h("dl", { class: "stats" }, stats.flatMap(([k, v]) => [h("dt", null, k), h("dd", null, v)])), h("p", { class: "muted small" }, `${p.salvaged7d} decided this week · ${p.neverOpenedPile.toLocaleString()} in the pile were never opened · ${dupes.size} duplicate URL${dupes.size === 1 ? "" : "s"}`)),
    p.topDomains.length ? h("section", { class: "card", "aria-label": "Where your links live" }, h("h2", null, "Where your links live"), h("ul", { class: "bars" }, p.topDomains.map((d) => h("li", null, h("span", null, d.domain), h("span", { class: "bar-track" }, h("span", { class: "bar", style: `width:${Math.round((d.count / maxDomain) * 100)}%` })), h("span", { class: "muted" }, String(d.count)))))) : null,
    h(
      "section",
      { class: "card", "aria-labelledby": "folders-h" },
      h("h2", { id: "folders-h" }, "Folders"),
      h("p", { class: "muted small" }, "Renaming moves every link in the folder. Bulk cleanup is a Pro tool."),
      p.byFolder.length
        ? h(
            "ul",
            { class: "link-list", "data-testid": "folder-list" },
            p.byFolder.map((f) => {
              const input = h("input", { type: "text", value: f.folder, "aria-label": `New name for folder ${f.folder}` });
              return h(
                "li",
                { class: "link-row" },
                h("div", { class: "link-main" }, h("span", { class: "link-title" }, f.folder), h("span", { class: "muted small" }, `${f.count} link${f.count === 1 ? "" : "s"}`)),
                h(
                  "div",
                  { class: "link-actions" },
                  input,
                  h("button", { class: "btn btn-tiny", type: "button", disabled: has("bulk-cleanup", state.entitlement) ? undefined : true, onclick: () => void renameFolder(f.folder, input.value).then((n) => say(n ? `Renamed “${f.folder}” → “${input.value.trim()}” for ${n} links.` : "Type a different folder name first.")) }, "Rename"),
                ),
              );
            }),
          )
        : h("p", { class: "muted" }, "No folders yet — they appear when you import a bookmarks file."),
    ),
  );
}

function importStatusLine() {
  const err = state.lastImportError;
  const res = state.lastImport;
  if (err) return h("p", { class: "locked", "data-testid": "import-status" }, `Could not import: ${err}`);
  if (!res) return h("p", { class: "muted", "data-testid": "import-status" }, "Pick or drop a file. Nothing leaves this browser.");
  const parts = [`${res.added} added`, `${res.merged} already had`, `${res.invalid} not a web link`];
  if (res.blockedByPlan) parts.push(`${res.blockedByPlan} over the free ${state.entitlement.linkLimit} link cap — not imported`);
  return h("p", { class: "muted", "data-testid": "import-status" }, `${res.source}: ${parts.join(", ")}.`);
}

function importView() {
  const announceStatus = () => {
    const el = document.querySelector<HTMLElement>("[data-testid='import-status']");
    if (el?.textContent) announce(el.textContent);
  };
  const readFile = async (file: File) => {
    try {
      const text = await file.text();
      if (/\.json$/i.test(file.name) || text.trim().startsWith("{")) recordImport(await importSnapshot(text));
      else recordImport(await importBookmarksHtml(text, file.name));
    } catch (e) {
      recordImportError(e instanceof Error ? e.message : String(e));
    }
    announceStatus();
  };
  const fileInput = h("input", { id: "file", type: "file", accept: ".html,.htm,.json,text/html,application/json", multiple: true, class: "file-input", "aria-label": "Bookmark or Salvage JSON file", onchange: async (e: Event) => { const files = (e.target as HTMLInputElement).files; if (!files) return; for (const f of Array.from(files)) await readFile(f); } });
  const drop = h(
    "div",
    {
      class: "drop",
      ondragover: (e: Event) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.add("drop-hot");
      },
      ondragleave: (e: Event) => (e.currentTarget as HTMLElement).classList.remove("drop-hot"),
      ondrop: (e: Event) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.remove("drop-hot");
        const files = (e as DragEvent).dataTransfer?.files;
        if (files) for (const f of Array.from(files)) void readFile(f);
      },
    },
    h("label", { for: "file" }, "Drop bookmarks.html / bookmarks.htm here, or choose a file"),
    fileInput,
  );
  const pasteArea = h("textarea", { id: "paste", rows: "4", spellcheck: "false", placeholder: "https://example.com/one\nhttps://example.com/two", "aria-label": "Paste links, one per line" });
  const dupes = findDuplicateGroups(linkList());
  const titleDupes = nearDuplicateTitleGroups(linkList());
  const locked = !has("dedupe", state.entitlement);
  return h(
    "div",
    null,
    h("section", { class: "card" }, h("h2", null, "Import"), drop, importStatusLine(), h("p", { class: "muted small" }, "Exports from Chrome, Firefox and Safari are understood, including folders and save dates. A Salvage JSON export re-imports with your triage state intact.")),
    h("section", { class: "card" }, h("h2", null, "Or paste links"), pasteArea, h("button", { class: "btn btn-primary", type: "button", "data-testid": "paste-import", onclick: () => { const v = pasteArea.value; if (!v.trim()) { recordImportError("nothing was pasted"); announceStatus(); return; } void importUrlList(v).then(recordImport).then(announceStatus); } }, "Add these links")),
    h(
      "section",
      { class: "card" },
      h("h2", null, "No file to hand?"),
      h("p", { class: "muted small" }, "Loads a demo library from the URLs our own research pass opened (a few may have moved or died since — that is half the point). Folders and save dates are synthetic, so you can watch how the deck handles an age spread. Nothing here came from a real person’s browser."),
      h("button", { class: "btn", type: "button", "data-testid": "demo-load", onclick: () => void fetch(new URL("sample-bookmarks.html", document.baseURI).href).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }).then((t) => importBookmarksHtml(t, "demo library")).then(recordImport).catch((e) => recordImportError(e instanceof Error ? e.message : String(e))).then(announceStatus) }, "Load demo library"),
    ),
    h(
      "section",
      { class: "card", "aria-labelledby": "dupes-h" },
      h("h2", { id: "dupes-h" }, "Duplicates"),
      locked
        ? h("p", { class: "locked" }, `Duplicate cleanup is a Pro tool. ${state.entitlement.daysLeft ? `${state.entitlement.daysLeft} trial day${state.entitlement.daysLeft === 1 ? "" : "s"} left.` : "Your trial has ended."}`)
        : dupes.size === 0
          ? h("p", { class: "muted" }, `No exact duplicate URLs. ${titleDupes.size} title${titleDupes.size === 1 ? "" : "s"} appear more than once, which is usually different pages that share a name.`)
          : h(
              "div",
              null,
              h("p", null, `${dupes.size} URL${dupes.size === 1 ? "" : "s"} saved more than once.`),
              h(
                "ul",
                { class: "link-list" },
                [...dupes.entries()].slice(0, 15).map(([key, group]) =>
                  h(
                    "li",
                    { class: "link-row", "data-dupe": key },
                    h("div", { class: "link-main" }, h("span", { class: "link-title" }, group[0].title), h("span", { class: "muted small" }, `kept in ${group.map((g) => g.folder).join(", ")}`)),
                    h("div", { class: "link-actions" }, h("button", { class: "btn btn-tiny btn-danger", type: "button", "data-focus-key": `dupe:${key}`, onclick: () => void bulkTossDuplicates(group[0].id, group.slice(1).map((g) => g.id)).then((n) => say(`Tossed ${n} duplicate${n === 1 ? "" : "s"} of ${shortHost(group[0].domain)}.`)) }, `Toss ${group.length - 1} copy${group.length - 1 === 1 ? "" : "ies"}`)),
                  ),
                ),
              ),
            ),
    ),
  );
}

function settingsView() {
  const e = state.entitlement;
  const total = state.settings.trialLengthDays || 40;
  const elapsed = e.plan === "pro-expired" ? total : total - (e.daysLeft ?? total);
  const deckSize = h("input", { id: "decksize", type: "number", min: "1", max: "20", value: String(state.settings.deckSize), "aria-label": "Cards per day" });
  const snooze = h("input", { id: "snooze", type: "number", min: "1", max: "365", value: String(state.settings.snoozeDays), "aria-label": "Snooze length in days" });
  const sizeRow = h("p", { class: "muted small" }, "Checking browser storage…");
  void db.estimate().then((s) => {
    sizeRow.textContent = s.error ? `Storage estimate unavailable: ${s.error}` : `Browser storage in use: ${formatBytes(s.usage)} of ${formatBytes(s.quota)} · persistence ${s.persisted ? "granted" : "not granted"}`;
  });
  return h(
    "div",
    null,
    h(
      "section",
      { class: "card", "aria-labelledby": "trial-h" },
      h("h2", { id: "trial-h" }, "Trial"),
      h("p", null, e.reason),
      h(
        "div",
        { class: "progress-track", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(Math.min(total, Math.max(0, elapsed))), "aria-valuetext": `${Math.min(total, Math.max(0, elapsed))} of ${total} trial days used` },
        h("div", { class: "progress-fill", style: `width:${Math.min(100, (elapsed / total) * 100)}%` }),
      ),
      h("p", { class: "small" }, `Started ${e.trialStart ? dateLabel(e.trialStart) : "not yet"} · ends ${e.trialEnds ? dateLabel(e.trialEnds) : "—"}`),
      h("p", { class: "locked small" }, "A soft trial, honestly labelled: this is a static site, so clearing site data resets the clock and we do not fingerprint you to stop that."),
      h("h3", null, "Pro tools"),
      h("ul", { class: "caps" }, PRO_CAPABILITIES.map((c: Capability) => h("li", { class: has(c, e) ? "cap-on" : "cap-off" }, `${has(c, e) ? "✓" : "·"} ${c.replace(/-/g, " ")}`))),
      h("p", { class: "muted small" }, `Always free: the daily deck up to ${FREE_DECK_SIZE} cards, search, import, browsing your whole library, and every export.`),
    ),
    h(
      "section",
      { class: "card" },
      h("h2", null, "Deck"),
      h("label", { class: "field", for: "decksize" }, "Cards per day", deckSize),
      h("label", { class: "field", for: "snooze" }, "Snooze days", snooze),
      h("p", { class: "muted small" }, `The free plan caps the deck at ${FREE_DECK_SIZE} cards a day whatever you set here.`),
      h("button", { class: "btn btn-primary", type: "button", "data-testid": "save-deck", onclick: () => void saveDeckSettings(Number(deckSize.value), Number(snooze.value)).then((r) => say(`Saved: ${r.deckSize} cards a day, snooze ${r.snoozeDays} days — ${r.appliesToday ? "applied to today's deck." : "from tomorrow's deck."}`)) }, "Save"),
    ),
    h(
      "section",
      { class: "card" },
      h("h2", null, "Your data"),
      h("div", { class: "row" }, h("button", { class: "btn", type: "button", "data-testid": "export-json", "data-focus-key": "export-json", onclick: () => { download(`salvage-${dateToday()}.json`, "application/json", toJson(linkList(), state.settings.libraryId, Date.now())); say(`Exported ${linkList().length} links as JSON.`); } }, "Export JSON (everything)"), h("button", { class: "btn", type: "button", "data-testid": "export-html", "data-focus-key": "export-html", onclick: () => { download("salvage-bookmarks.html", "text/html", toBookmarksHtml(linkList(), Date.now())); say("Exported a bookmarks.html any browser can open."); } }, "Export bookmarks.html")),
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn", type: "button", disabled: has("export-csv", e) ? undefined : true, "data-focus-key": "export-csv", onclick: () => { download(`salvage-${dateToday()}.csv`, "text/csv", toCsv(linkList())); say("Exported CSV."); } }, "Export CSV"),
        h("button", { class: "btn", type: "button", disabled: has("ics-reminder", e) ? undefined : true, "data-focus-key": "export-ics", onclick: () => { download("salvage-reminder.ics", "text/calendar", buildWeeklyReminderIcs({ now: Date.now(), url: location.href })); say("Downloaded a weekly calendar reminder."); } }, "Weekly reminder (.ics)"),
        h("button", { class: "btn", type: "button", "data-testid": "persist-btn", "data-focus-key": "persist", onclick: () => void db.requestPersistence().then((ok) => say(ok ? "The browser granted persistent storage." : "The browser did not grant persistence. Export monthly: Safari can clear this library after a week without a visit.")) }, "Ask browser to keep my data"),
      ),
      sizeRow,
      h("p", { class: "action-feedback", "data-testid": "settings-feedback" }, state.lastAction ?? ""),
    ),
    h(
      "section",
      { class: "card card-danger" },
      h("h2", null, "Delete everything"),
      h("p", { class: "muted" }, "Removes the library, deck history and trial clock from this browser only. Not reversible — export first if there is any chance you want it back."),
      h("button", { class: "btn btn-danger", type: "button", "data-testid": "wipe", onclick: () => { if (window.confirm("Delete the whole library from this browser?")) void resetAll().then(() => setRoute("import")); } }, "Delete all local data"),
    ),
  );
}

function limitsView() {
  const rows: [string, string][] = [
    ["What leaves this device", "Nothing. No analytics, no account, no server. Open the Network tab: after the first load the only requests are for this site's own files."],
    ["Where your links live", `IndexedDB in this browser profile (${linkList().length.toLocaleString()} links right now). Export any time — export is free on every plan, forever.`],
    ["What static hosting makes impossible", "We cannot fetch the text of an arbitrary page for you: publishers must opt in with CORS headers and they do not. Read cards by opening them; paste a note if you want to keep a quote."],
    ["Why there is no morning notification", "Push needs a server, and Periodic Background Sync is Chromium-only and engagement-gated. The .ics reminder in Settings is the portable version of the same idea."],
    ["The risk on iPhone and Safari", "Safari can delete script-created storage after 7 days without a visit unless the site is persistent or installed. Use “Ask browser to keep my data”, install to the Home Screen, and export monthly. Those reduce the documented risk; they are not a guarantee."],
    ["Dead links", "We cannot scan the whole library for dead links from a browser without a third-party proxy, which would send your URLs to someone else. Toss anything that will not open and it leaves the deck."],
    ["The trial", "Soft by construction. Clearing site data resets it; we accept that rather than fingerprinting you."],
  ];
  return h("section", { class: "card", "aria-labelledby": "limits-h" }, h("h2", { id: "limits-h" }, "Limits & privacy, plainly"), h("dl", { class: "qa" }, rows.flatMap(([k, v]) => [h("dt", null, k), h("dd", null, v)])));
}

function dateToday(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export function render(root: HTMLElement): void {
  const active = document.activeElement as HTMLElement | null;
  const keepFocus = active?.dataset?.focusKey ?? null;
  const views: Record<Route, () => HTMLElement | null> = {
    deck: deckView,
    queue: queueView,
    library: libraryView,
    pulse: pulseView,
    import: importView,
    settings: settingsView,
    limits: limitsView,
  };
  const body = state.loading
    ? h("section", { class: "card" }, h("p", { class: "muted" }, "Loading your library…"))
    : state.error && !linkList().length
      ? h("section", { class: "card card-danger" }, h("h2", null, "Could not open your local library"), h("p", null, state.error), h("p", { class: "muted" }, "Private windows and blocked storage cause this. Try a normal window, or rebuild from an export with Import."))
      : (views[state.route]() ?? h("section", { class: "card" }, h("p", null, "Nothing to show.")));
  clear(root);
  root.append(...[
    h("header", { class: "site-head" }, h("h1", { class: "brand" }, h("a", { href: "#/deck" }, "Salvage")), h("div", { class: "head-right" }, trialChip()), h("nav", { "aria-label": "Main" }, NAV.map((n) => h("a", { class: state.route === n.route ? "nav-active" : "", href: `#/${n.route}`, "aria-current": state.route === n.route ? "page" : undefined, "data-route": n.route }, h("span", null, n.label), h("kbd", null, n.key)))), progressRow()),
    state.error && linkList().length ? h("p", { class: "locked", "data-testid": "storage-warning" }, `Storage problem: ${state.error} The screen may be showing a change the browser refused to save.`) : null,
    h("main", { id: "main", tabindex: "-1" }, body),
    h("footer", { class: "site-foot" }, h("p", { class: "muted small" }, "Local-first: your links stay on this device · ", h("a", { href: "#/limits" }, "what this cannot do"))),
  ].filter((n) => n !== null) as Node[]);
  if (keepFocus) {
    const again = root.querySelector<HTMLElement>(`[data-focus-key="${keepFocus}"]`);
    if (again) {
      again.focus({ preventScroll: true });
      return;
    }
  }
  if (state.route === "deck") moveDeckFocus(root);
}
