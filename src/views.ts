import { h, announce, shortHost, dateLabel, focusFirst, clear } from "./dom.ts";
import { currentCard, currentReasons, linkList, markDone, state, triage, undo, importBookmarksHtml, importUrlList, importSnapshot, bulkTossDuplicates, renameFolder, setRoute, setStatus, setNote, resetAll, recordImport, recordImportError, type Route } from "./state.ts";
import { findDuplicateGroups, nearDuplicateTitleGroups } from "./bookmarks.ts";
import { buildIndex, search } from "./search.ts";
import { computePulse, formatBytes, humanAge } from "./stats.ts";
import { toJson, toCsv, toBookmarksHtml, download } from "./exporters.ts";
import { buildWeeklyReminderIcs } from "./ics.ts";
import { PRO_CAPABILITIES, has, type Capability } from "./trial.ts";
import type { SalvageLink } from "./model.ts";
import * as db from "./db.ts";

let searchTimer = 0;

const NAV: { route: Route; label: string; key: string }[] = [
  { route: "deck", label: "Deck", key: "1" },
  { route: "queue", label: "Queue", key: "2" },
  { route: "library", label: "Library", key: "3" },
  { route: "pulse", label: "Pulse", key: "4" },
  { route: "import", label: "Import", key: "5" },
  { route: "settings", label: "Settings", key: "6" },
  { route: "limits", label: "Limits & privacy", key: "7" },
];

function trialChip() {
  const e = state.entitlement;
  if (e.plan === "pro-trial") {
    const total = state.settings.trialLengthDays || 40;
    const day = Math.min(total, Math.max(1, total - (e.daysLeft ?? total) + 1));
    return h("div", { class: "chip chip-trial", role: "status" }, `Trial day ${day} of ${total} · ${e.daysLeft} left`);
  }
  if (e.plan === "pro-expired") return h("div", { class: "chip chip-locked", role: "status" }, "Trial ended · free plan");
  return h("div", { class: "chip", role: "status" }, "Trial starts at first import");
}

function progressRow() {
  const links = linkList();
  const pulse = computePulse(links, state.events, state.now, state.settings.streakDays);
  if (!links.length) return null;
  return h(
    "div",
    { class: "progress-row" },
    h("div", { class: "progress-track", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pulse.progressPct), "aria-label": "Share of library triaged" }, h("div", { class: "progress-fill", style: `width:${Math.max(1, pulse.progressPct)}%` })),
    h("span", { class: "progress-text" }, `${pulse.pile.toLocaleString()} in pile · ${pulse.progressPct}% triaged · ${pulse.streakDays}d streak`),
  );
}

function emptyDeck() {
  const links = linkList();
  const snoozed = links.filter((l) => l.snoozedUntil !== null && l.snoozedUntil > state.now).length;
  return h(
    "section",
    { class: "card empty", "aria-labelledby": "empty-h" },
    h("h2", { id: "empty-h" }, links.length ? "Deck cleared" : "Nothing here yet"),
    h("p", null, links.length ? `${snoozed ? `${snoozed} snoozed, ` : ""}nothing left to surface today.` : "Import a bookmarks file or paste a few links, and today's deck appears here."),
    links.length
      ? h(
          "div",
          { class: "row" },
          h("button", { class: "btn", type: "button", onclick: () => setRoute("pulse") }, "See your pulse"),
          h("button", { class: "btn", type: "button", onclick: () => setRoute("import") }, "Add more links"),
        )
      : h("a", { class: "btn btn-primary", href: "#/import" }, "Import bookmarks"),
  );
}

function afterTriage(): void {
  const next = currentCard();
  const remaining = state.deck?.linkIds.length ?? 0;
  announce(next ? `Card ${state.deckIndex + 1} of ${remaining}: ${next.title}` : "Deck cleared for today. Import more or come back tomorrow.");
  const el = document.querySelector<HTMLElement>("[data-testid='deck-card'] .deck-title");
  el?.focus?.();
}

function deckView() {
  const card = currentCard();
  if (!card) return emptyDeck();
  const reasons = currentReasons();
  return h(
    "section",
    { class: "card deck", "aria-labelledby": "deck-title", "data-testid": "deck-card" },
    h("div", { class: "deck-head" }, h("h2", { id: "deck-title" }, "Today's deck"), h("span", { class: "muted", "data-testid": "deck-pos" }, `${state.deckIndex + 1} of ${state.deck?.linkIds.length ?? 0}`)),
    h("div", { class: "chips" }, h("span", { class: "chip chip-host" }, shortHost(card.domain)), card.folder ? h("span", { class: "chip" }, card.folder) : null, card.addDate ? h("span", { class: "chip" }, `saved ${humanAge(card.addDate, state.now)}`) : null, card.openCount > 0 ? h("span", { class: "chip" }, `opened ${card.openCount}×`) : h("span", { class: "chip chip-warn" }, "never opened")),
    h("h3", { class: "deck-title", tabindex: "-1" }, card.title),
    h("a", { class: "deck-url", href: card.url, target: "_blank", rel: "noopener noreferrer" }, card.url),
    reasons.length ? h("p", { class: "why" }, h("span", { class: "why-label" }, "Why now: "), reasons.join(" · ")) : null,
    h(
      "div",
      { class: "actions" },
      h("button", { class: "btn btn-primary", type: "button", "data-action": "open", onclick: () => void triage("open").then(afterTriage) }, h("span", null, "Open"), h("kbd", null, "O")),
      h("button", { class: "btn", type: "button", "data-action": "keep", onclick: () => void triage("keep").then(afterTriage) }, h("span", null, "Keep for reading"), h("kbd", null, "K")),
      h("button", { class: "btn", type: "button", "data-action": "snooze", onclick: () => void triage("snooze").then(afterTriage) }, h("span", null, `Snooze ${state.settings.snoozeDays}d`), h("kbd", null, "S")),
      h("button", { class: "btn btn-danger", type: "button", "data-action": "toss", onclick: () => void triage("toss").then(afterTriage) }, h("span", null, "Toss it"), h("kbd", null, "X")),
    ),
    h(
      "div",
      { class: "actions actions-sub" },
      h("button", { class: "btn btn-quiet", type: "button", "data-action": "undo", onclick: () => void undo().then(announce) }, "Undo"),
      state.undoStack.length ? h("span", { class: "muted small" }, `${state.undoStack.length} reversible action${state.undoStack.length > 1 ? "s" : ""}`) : null,
    ),
  );
}

function linkRow(l: SalvageLink, showStatus = true) {
  const noteInput = h("input", { class: "note", type: "text", value: l.note, placeholder: "Note", "aria-label": `Note for ${l.title}`, disabled: has("notes", state.entitlement) ? undefined : true, onchange: (e: Event) => void setNote(l.id, (e.target as HTMLInputElement).value) });
  return h(
    "li",
    { class: "link-row", "data-id": l.id },
    h("div", { class: "link-main" }, h("a", { class: "link-title", href: l.url, target: "_blank", rel: "noopener noreferrer" }, l.title), h("div", { class: "link-meta" }, h("span", { class: "chip chip-host" }, shortHost(l.domain)), showStatus ? h("span", { class: `chip chip-${l.status}` }, l.status) : null, l.folder ? h("span", { class: "chip" }, l.folder) : null, h("span", { class: "muted small" }, l.addDate ? `saved ${dateLabel(l.addDate)}` : "no save date"), h("span", { class: "muted small" }, `opened ${l.openCount}×`), l.snoozedUntil && l.snoozedUntil > state.now ? h("span", { class: "chip chip-warn" }, `snoozed to ${dateLabel(l.snoozedUntil)}`) : null)),
    h(
      "div",
      { class: "link-actions" },
      h("button", { class: "btn btn-tiny", type: "button", onclick: () => { window.open(l.url, "_blank", "noopener,noreferrer"); void markDone(l.id).then(() => announce("Marked done")); } }, "Read"),
      l.status !== "done" ? h("button", { class: "btn btn-tiny", type: "button", onclick: () => void markDone(l.id) }, "Done") : null,
      l.status !== "tossed" ? h("button", { class: "btn btn-tiny", type: "button", onclick: () => void setStatus(l.id, "tossed") }, "Toss") : h("button", { class: "btn btn-tiny", type: "button", onclick: () => void setStatus(l.id, "pile") }, "Restore"),
      noteInput,
    ),
  );
}

function listSection(title: string, links: SalvageLink[], testid: string, empty = "Nothing here.") {
  return h(
    "section",
    { class: "card", "aria-label": title },
    h("h2", { "data-testid": testid }, title),
    links.length ? h("ul", { class: "link-list" }, links.map((l) => linkRow(l))) : h("p", { class: "muted" }, empty),
  );
}

function queueView() {
  const links = linkList().filter((l) => l.status === "queued").sort((a, b) => (b.kept ? 1 : 0) - (a.kept ? 1 : 0) || (a.lastOpenedAt ?? a.importedAt) - (b.lastOpenedAt ?? b.importedAt));
  const stale = links.filter((l) => state.now - (l.lastOpenedAt ?? l.importedAt) > 30 * 86_400_000);
  return h(
    "div",
    null,
    h(
      "div",
      { class: "row row-spread" },
      h("p", { class: "muted" }, `${links.length} waiting · ${stale.length} older than a month (they will rejoin the deck if you toss them)`),
      stale.length ? h("button", { class: "btn", type: "button", onclick: () => { for (const l of stale.slice(0, 20)) void setStatus(l.id, "pile"); announce("20 stale queue items moved back to the pile"); } }, "Return stale to pile") : null,
    ),
    listSection("Reading queue", links.slice(0, 100), "queue-count", "Queue is empty. Press Keep for reading on a card to send something here."),
  );
}

function libraryView() {
  const all = linkList();
  const resultsWrap = h("div", { "data-testid": "results-wrap" });
  const runSearch = () => {
    const q = state.query.trim();
    const index = buildIndex(all);
    const found = q
      ? search(index, q, 200).map((r) => state.links.get(r.id)).filter((l): l is SalvageLink => !!l)
      : all.slice().sort((a, b) => (b.addDate ?? b.importedAt) - (a.addDate ?? a.importedAt)).slice(0, 200);
    clear(resultsWrap);
    resultsWrap.append(
      h("p", { class: "muted", "data-testid": "library-count" }, q ? `${found.length} match${found.length === 1 ? "" : "es"} for “${q}” · ranked locally with BM25, nothing sent anywhere` : `${all.length.toLocaleString()} links · showing newest 200 — search to find the old ones`),
      found.length ? h("ul", { class: "link-list" }, found.map((l) => linkRow(l))) : h("p", { class: "muted" }, q ? `No match for “${q}”. Try one word, or the site name.` : "Library is empty."),
    );
  };
  const input = h("input", {
    id: "search-box",
    class: "search-box",
    type: "search",
    placeholder: "Search your own saves — titles, folders, sites, notes",
    "aria-label": "Search library",
    value: state.query,
    oninput: (e: Event) => {
      state.query = (e.target as HTMLInputElement).value;
      if (searchTimer) window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(runSearch, 180);
    },
  });
  runSearch();
  return h(
    "section",
    { class: "card", "aria-label": "Library" },
    h("h2", null, "Library"),
    input,
    resultsWrap,
  );
}

function pulseView() {
  const links = linkList();
  const pulse = computePulse(links, state.events, state.now, state.settings.streakDays);
  const dupes = findDuplicateGroups(links);
  const stats = [
    ["Links", pulse.total.toLocaleString()],
    ["In the pile", pulse.pile.toLocaleString()],
    ["Never opened", pulse.neverOpenedPile.toLocaleString()],
    ["Salvaged this week", String(pulse.salvaged7d)],
    ["Salvaged all time", String(pulse.salvagedTotal)],
    ["Triaged", `${pulse.progressPct}%`],
    ["Streak", `${pulse.streakDays} day${pulse.streakDays === 1 ? "" : "s"}`],
    ["Oldest save", pulse.oldestSaved ? `${humanAge(pulse.oldestSaved, state.now)} (${dateLabel(pulse.oldestSaved)})` : "unknown"],
    ["Exact duplicates", String(dupes.size)],
    ["Shared site roots", pulse.topDomains.slice(0, 3).map((d) => `${d.domain} (${d.count})`).join(", ") || "—"],
  ];
  return h(
    "div",
    null,
    h("section", { class: "card", "aria-label": "Numbers" }, h("h2", { "data-testid": "pulse-title" }, "Pulse"), h("dl", { class: "stats" }, stats.flatMap(([k, v]) => [h("dt", null, k), h("dd", null, v)]))),
    pulse.topDomains.length
      ? h(
          "section",
          { class: "card", "aria-label": "Where your links live" },
          h("h2", null, "Where your links live"),
          h("ul", { class: "bars" }, pulse.topDomains.map((d) => h("li", null, h("span", null, d.domain), h("span", { class: "bar-track" }, h("span", { class: "bar", style: `width:${Math.round((d.count / pulse.topDomains[0].count) * 100)}%` })), h("span", { class: "muted" }, String(d.count))))),
        )
      : null,
    h(
      "section",
      { class: "card", "aria-labelledby": "folders-h" },
      h("h2", { id: "folders-h" }, "Folders"),
      h("p", { class: "muted small" }, "Renaming a folder moves every link in it. Bulk cleanup is a Pro tool."),
      pulse.byFolder.length
        ? h(
            "ul",
            { class: "link-list", "data-testid": "folder-list" },
            pulse.byFolder.map((f) => {
              const input = h("input", { type: "text", value: f.folder, "aria-label": `New name for folder ${f.folder}` });
              return h(
                "li",
                { class: "link-row" },
                h("div", { class: "link-main" }, h("span", { class: "link-title" }, f.folder), h("span", { class: "muted small" }, `${f.count} link${f.count === 1 ? "" : "s"}`)),
                h(
                  "div",
                  { class: "link-actions" },
                  input,
                  h("button", { class: "btn btn-tiny", type: "button", disabled: has("bulk-cleanup", state.entitlement) ? undefined : true, onclick: () => { const to = input.value.trim(); if (!to || to === f.folder) { announce("Enter a different folder name first"); return; } void renameFolder(f.folder, to).then((n) => announce(`Renamed folder with ${n} links`)); } }, "Rename"),
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
  if (err) return h("p", { class: "locked", role: "status", "data-testid": "import-status" }, `Could not import: ${err}`);
  if (!res) return h("p", { class: "muted", role: "status", "data-testid": "import-status" }, "Pick or drop a file. Nothing leaves this browser.");
  const parts = [`${res.added} added`, `${res.merged} already had`, `${res.skippedDuplicates} duplicates in that file`, `${res.invalid} not a web link`];
  if (res.blockedByPlan) parts.push(`${res.blockedByPlan} over the free ${state.entitlement.linkLimit} link cap — not imported`);
  return h("p", { class: "muted", role: "status", "data-testid": "import-status" }, `${res.source}: ${parts.join(", ")}.`);
}

function importView() {
  const readFile = async (file: File) => {
    try {
      const text = await file.text();
      if (/\.json$/i.test(file.name) || text.trim().startsWith("{")) recordImport(await importSnapshot(text));
      else recordImport(await importBookmarksHtml(text, file.name));
    } catch (e) {
      recordImportError(e instanceof Error ? e.message : String(e));
    }
  };
  const fileInput = h("input", { id: "file", type: "file", accept: ".html,.htm,.json,text/html,application/json", multiple: true, class: "file-input", "aria-label": "Bookmark or Salvage JSON file", onchange: async (e: Event) => { const files = (e.target as HTMLInputElement).files; if (!files) return; for (const f of Array.from(files)) await readFile(f); } });
  const drop = h("div", { class: "drop", ondragover: (e: Event) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add("drop-hot"); }, ondragleave: (e: Event) => { (e.currentTarget as HTMLElement).classList.remove("drop-hot"); }, ondrop: (e: Event) => { e.preventDefault(); const files = (e as DragEvent).dataTransfer?.files; if (files) for (const f of Array.from(files)) void readFile(f); } }, h("label", { for: "file" }, "Drop bookmarks.html / bookmarks.htm here, or choose a file"), fileInput);
  const pasteArea = h("textarea", { id: "paste", rows: "4", spellcheck: "false", placeholder: "https://example.com/one\nhttps://example.com/two", "aria-label": "Paste links, one per line" });
  const dupes = findDuplicateGroups(linkList());
  const titleDupes = nearDuplicateTitleGroups(linkList());
  const proLocked = !has("dedupe", state.entitlement);
  const announceImport = () => {
    const el = document.querySelector("[data-testid='import-status']");
    if (el?.textContent) announce(el.textContent);
  };
  return h(
    "div",
    null,
    h("section", { class: "card" }, h("h2", null, "Import"), drop, importStatusLine(), h("p", { class: "muted small" }, "Exports from Chrome, Firefox and Safari (“bookmarks.html”) are understood, including folder structure and save dates. Salvage JSON exports re-import with your triage state intact.")),
    h(
      "section",
      { class: "card" },
      h("h2", null, "Or paste links"),
      pasteArea,
      h("button", { class: "btn btn-primary", type: "button", "data-testid": "paste-import", onclick: () => { const v = pasteArea.value; if (!v.trim()) { recordImportError("nothing was pasted"); announceImport(); return; } void importUrlList(v).then(recordImport).then(announceImport); } }, "Add these links"),
    ),
    h(
      "section",
      { class: "card" },
      h("h2", null, "No file to hand?"),
      h("p", { class: "muted small" }, "Loads a demo library built from the URLs our own research pass verified — every link is a real public page. The folder names and save dates are synthetic (assigned by hash), so you can watch how the deck handles an age spread. No real person's browser was used."),
      h("button", { class: "btn", type: "button", "data-testid": "demo-load", onclick: () => { void fetch(new URL("sample-bookmarks.html", document.baseURI).href).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }).then((t) => importBookmarksHtml(t, "demo: research URLs")).then((res) => { recordImport(res); announceImport(); }).catch((e) => { recordImportError(e instanceof Error ? e.message : String(e)); announceImport(); }); } }, "Load demo library"),
    ),
    h(
      "section",
      { class: "card" },
      h("h2", null, "Duplicates"),
      proLocked
        ? h("p", { class: "locked" }, `Duplicate cleanup is a Pro tool. ${state.entitlement.daysLeft ? `${state.entitlement.daysLeft} trial days left.` : "Your trial has ended."}`)
        : dupes.size === 0
          ? h("p", { class: "muted" }, `No exact duplicate URLs. ${titleDupes.size} title match${titleDupes.size === 1 ? "" : "es"} worth a look.`)
          : h(
              "div",
              null,
              h("p", null, `${dupes.size} URL${dupes.size === 1 ? "" : "s"} saved more than once.`),
              h("ul", { class: "link-list" }, [...dupes.entries()].slice(0, 15).map(([key, group]) => h("li", { class: "link-row", "data-dupe": key }, linkRow(group[0], false), h(
                "div",
                { class: "link-actions" },
                h("button", { class: "btn btn-tiny btn-danger", type: "button", onclick: () => void bulkTossDuplicates(group[0].id, group.slice(1).map((g) => g.id)).then((n) => announce(`${n} duplicates tossed`)) }, `Toss ${group.length - 1} copy${group.length - 1 === 1 ? "" : "ies"}`),
              )))),
            ),
    ),
  );
}

function settingsView() {
  const e = state.entitlement;
  const deckSize = h("input", { id: "decksize", type: "number", min: "1", max: "20", value: String(state.settings.deckSize), "aria-label": "Cards per day" });
  const snooze = h("input", { id: "snooze", type: "number", min: "1", max: "90", value: String(state.settings.snoozeDays), "aria-label": "Snooze length in days" });
  const persistBtn = h("button", { class: "btn", type: "button", "data-testid": "persist-btn", onclick: () => void db.requestPersistence().then((ok) => { status.textContent = ok ? "Storage persistence granted by the browser." : "The browser did not grant persistence. Keep an export: your library is not guaranteed to survive on iOS Safari if you do not open this site for a week."; }) }, "Ask browser to keep my data");
  const status = h("p", { class: "muted", role: "status", "data-testid": "settings-status" }, "");
  const sizeRow = h("p", { class: "muted small" }, "…");
  void db.estimate().then((s) => {
    sizeRow.textContent = `Browser storage in use: ${formatBytes(s.usage)} of ${formatBytes(s.quota)} · persistence ${s.persisted ? "granted" : "not granted"}`;
  });
  const freeExports = h(
    "div",
    { class: "row" },
    h("button", { class: "btn", type: "button", "data-testid": "export-json", onclick: () => { download(`salvage-${dateKeyToday()}.json`, "application/json", toJson(linkList(), state.settings.libraryId, state.now)); announce("Exported JSON"); } }, "Export JSON (everything)"),
    h("button", { class: "btn", type: "button", "data-testid": "export-html", onclick: () => { download(`salvage-bookmarks.html`, "text/html", toBookmarksHtml(linkList(), state.now)); announce("Exported bookmarks HTML"); } }, "Export bookmarks.html"),
  );
  const csvBtn = h("button", { class: "btn", type: "button", disabled: has("export-csv", e) ? undefined : true, onclick: () => { download(`salvage-${dateKeyToday()}.csv`, "text/csv", toCsv(linkList())); announce("Exported CSV"); } }, "Export CSV");
  const icsBtn = h("button", { class: "btn", type: "button", disabled: has("ics-reminder", e) ? undefined : true, onclick: () => { download("salvage-reminder.ics", "text/calendar", buildWeeklyReminderIcs({ now: state.now, url: location.href })); announce("Calendar reminder downloaded"); } }, "Download weekly reminder (.ics)");
  return h(
    "div",
    null,
    h(
      "section",
      { class: "card", "aria-labelledby": "trial-h" },
      h("h2", { id: "trial-h" }, "Trial"),
      h("p", null, e.reason),
      h("div", { class: "progress-track", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "40", "aria-valuenow": String(40 - (e.daysLeft ?? 40)), "aria-label": "Trial days elapsed" }, h("div", { class: "progress-fill", style: `width:${Math.min(100, ((40 - (e.daysLeft ?? 40)) / 40) * 100)}%` })),
      h("p", { class: "small" }, `Started: ${e.trialStart ? dateLabel(e.trialStart) : "not yet"} · Ends: ${e.trialEnds ? dateLabel(e.trialEnds) : "—"}`),
      h("p", { class: "locked small" }, "This is a soft trial: the site is static, so clearing site data resets it. We could fingerprint you to stop that and we would rather not."),
      h("h3", null, "Pro tools"),
      h("ul", { class: "caps" }, PRO_CAPABILITIES.map((c: Capability) => h("li", { class: has(c, e) ? "cap-on" : "cap-off" }, `${has(c, e) ? "✓" : "·"} ${c.replace(/-/g, " ")}`))),
      h("p", { class: "muted small" }, "Always free: the daily deck, search, import, JSON and bookmarks.html export, browsing your whole library."),
    ),
    h(
      "section",
      { class: "card" },
      h("h2", null, "Deck"),
      h("label", { class: "field", for: "decksize" }, "Cards per day", deckSize),
      h("label", { class: "field", for: "snooze" }, "Snooze days", snooze),
      h("button", { class: "btn btn-primary", type: "button", onclick: () => { const d = Math.min(20, Math.max(1, Number(deckSize.value) || 5)); const s = Math.min(90, Math.max(1, Number(snooze.value) || 7)); void db.saveSettings({ ...state.settings, deckSize: d, snoozeDays: s }).then(() => { state.settings = { ...state.settings, deckSize: d, snoozeDays: s }; status.textContent = `Saved: ${d} cards/day, snooze ${s} days (tomorrow's deck).`; announce("Settings saved"); }); } }, "Save"),
    ),
    h("section", { class: "card" }, h("h2", null, "Your data"), freeExports, h("div", { class: "row" }, csvBtn, icsBtn, persistBtn), sizeRow, status),
    h(
      "section",
      { class: "card card-danger" },
      h("h2", null, "Delete everything"),
      h("p", { class: "muted" }, "Removes the library, the deck history and the trial clock from this browser. Not reversible."),
      h("button", { class: "btn btn-danger", type: "button", onclick: () => { if (window.confirm("Delete the whole library from this browser? Export first if you might want it back.")) void resetAll().then(() => { setRoute("import"); announce("Library deleted"); }); } }, "Delete all local data"),
    ),
  );
}

function dateKeyToday(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function limitsView() {
  const rows = [
    ["What leaves this device", "Nothing. There is no analytics script, no account, no server. Check the Network tab: after the first load the only requests are for this site's own files."],
    ["Where your links live", "IndexedDB in this browser profile. Export any time (JSON or bookmarks.html) — export is free forever, on every plan."],
    ["What we cannot do on static hosting", "We cannot fetch the text of an arbitrary page for you: publishers must opt in with CORS headers and they do not. Read cards by opening them; paste a note if you want to keep a quote."],
    ["Why there is no push notification", "Push needs a server and Periodic Background Sync is Chromium-only and engagement-gated. The .ics reminder in Settings is the portable version."],
    ["The risk on iPhone/Safari", `Safari deletes script-created storage after 7 days without a visit unless the site is persistent or installed. ${state.entitlement.trialStart ? "" : ""}Use “Ask browser to keep my data”, install to the Home Screen, and export monthly.`],
    ["Dead links", "We cannot scan your whole library for dead links without a proxy. We do show you what you never opened, and what you already flagged as stale."],
  ];
  return h(
    "section",
    { class: "card", "aria-labelledby": "limits-h" },
    h("h2", { id: "limits-h" }, "Limits & privacy, plainly"),
    h("dl", { class: "qa" }, rows.flatMap(([k, v]) => [h("dt", null, k), h("dd", null, v)])),
  );
}

export function render(root: HTMLElement): void {
  const heading = h("h1", { class: "brand" }, h("a", { href: "#/deck" }, "Salvage"));
  const nav = h(
    "nav",
    { "aria-label": "Main" },
    NAV.map((n) =>
      h("a", { class: state.route === n.route ? "nav-active" : "", href: `#/${n.route}`, "aria-current": state.route === n.route ? "page" : undefined, "data-route": n.route }, h("span", null, n.label), h("kbd", null, n.key)),
    ),
  );
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
    : state.error
      ? h("section", { class: "card card-danger" }, h("h2", null, "Could not open your local library"), h("p", null, state.error), h("p", { class: "muted" }, "Private windows and blocked storage cause this. Try a normal window, or export from the browser that has the data."))
      : (views[state.route]() ?? h("section", { class: "card" }, h("p", null, "Nothing to show.")));
  clear(root);
  root.append(
    h("header", { class: "site-head" }, heading, h("div", { class: "head-right" }, trialChip()), nav, progressRow()),
    h("main", { id: "main", tabindex: "-1" }, body),
    h("footer", { class: "site-foot" }, h("p", { class: "muted small" }, "Salvage · your links never leave this browser · ", h("a", { href: "#/limits" }, "what it cannot do"))),
  );
  if (state.route === "deck") focusFirst(root, "[data-action='open']");
  return;
}
