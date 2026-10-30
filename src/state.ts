import * as db from "./db.ts";
import { parseBookmarksHtml, type ParsedBookmark } from "./bookmarks.ts";
import { buildDeck, dateKeyOf } from "./resurfacer.ts";
import { DEFAULT_SETTINGS, type DeckRecord, type SalvageEvent, type SalvageLink, type Settings } from "./model.ts";
import { allowedDeckFor, DEFAULT_TRIAL_DAYS, ensureTrialStarted, FREE_DECK_SIZE, getEntitlement, type Entitlement } from "./trial.ts";
import { recomputeStreak } from "./stats.ts";
import { fromJson } from "./exporters.ts";
import { canonicalUrl, dedupeKey, domainOf, isHttpish, titleFromUrl } from "./normalize.ts";

export type Route = "deck" | "queue" | "library" | "pulse" | "import" | "settings" | "limits";

export interface ImportResult {
  added: number;
  merged: number;
  skippedDuplicates: number;
  invalid: number;
  blockedByPlan: number;
  source: string;
}

interface UndoEntry {
  linkId: string;
  prev: Partial<SalvageLink>;
  label: string;
}

export interface Store {
  links: Map<string, SalvageLink>;
  events: (SalvageEvent & { id: string })[];
  settings: Settings;
  entitlement: Entitlement;
  deck: DeckRecord | null;
  /** Index into deck.linkIds of the card currently on screen. */
  deckIndex: number;
  undoStack: UndoEntry[];
  now: number;
  route: Route;
  query: string;
  loading: boolean;
  error: string | null;
  lastImport: ImportResult | null;
  lastImportError: string | null;
  /** Shown next to Undo so the action is not screen-reader-only. */
  lastAction: string | null;
  libraryVersion: number;
  externalChangeAt: number | null;
  storage: { usage: number; quota: number; persisted: boolean; error: string | null } | null;
}

const listeners = new Set<(s: Store) => void>();
const DAY = 86_400_000;
const SYNC_KEY = "salvage:sync";

export const state: Store = {
  links: new Map(),
  events: [],
  settings: { ...DEFAULT_SETTINGS },
  entitlement: getEntitlement(DEFAULT_SETTINGS, Date.now()),
  deck: null,
  deckIndex: 0,
  undoStack: [],
  now: Date.now(),
  route: "deck",
  query: "",
  loading: true,
  error: null,
  lastImport: null,
  lastImportError: null,
  lastAction: null,
  libraryVersion: 0,
  externalChangeAt: null,
  storage: null,
};

export function subscribe(fn: (s: Store) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  state.now = Date.now();
  state.entitlement = getEntitlement(state.settings, state.now);
  for (const fn of listeners) fn(state);
}

function bumpLibrary(): void {
  state.libraryVersion += 1;
}

function pingOtherTabs(): void {
  try {
    localStorage.setItem(SYNC_KEY, String(state.now));
  } catch {
    /* private mode: cross-tab sync is a nicety, never an error */
  }
}

/** Imports are serialised: two files dropped in the same tick must not share free-plan headroom. */
let importChain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = importChain.then(fn, fn);
  importChain = run.catch(() => undefined);
  return run;
}

export function normaliseSettings(raw: Partial<Settings> | null | undefined): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  s.deckSize = Number.isFinite(raw?.deckSize) ? Math.min(20, Math.max(1, Math.round(raw!.deckSize!))) : DEFAULT_SETTINGS.deckSize;
  s.snoozeDays = Number.isFinite(raw?.snoozeDays) ? Math.min(365, Math.max(1, Math.round(raw!.snoozeDays!))) : DEFAULT_SETTINGS.snoozeDays;
  s.trialLengthDays = Number.isFinite(raw?.trialLengthDays) && raw!.trialLengthDays! > 0 ? Math.min(365, Math.round(raw!.trialLengthDays!)) : DEFAULT_TRIAL_DAYS;
  s.firstRunAt = typeof raw?.firstRunAt === "number" && Number.isFinite(raw.firstRunAt) ? raw.firstRunAt : null;
  s.streakDays = Number.isFinite(raw?.streakDays) ? Math.max(0, Math.round(raw!.streakDays!)) : 0;
  s.libraryId = typeof raw?.libraryId === "string" && raw.libraryId ? raw.libraryId : "default";
  s.lastSeenDate = typeof raw?.lastSeenDate === "string" ? raw.lastSeenDate : null;
  return s;
}

/** A link straight off disk or out of a JSON file is untrusted input. */
export function sanitizeLink(raw: Partial<SalvageLink> | null | undefined, now: number): SalvageLink | null {
  if (!raw || typeof raw.url !== "string") return null;
  const url = canonicalUrl(raw.url);
  if (!url || !isHttpish(url)) return null;
  const status = raw.status === "queued" || raw.status === "done" || raw.status === "tossed" || raw.status === "pile" ? raw.status : "pile";
  const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
  const time = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    id: str(raw.id) || dbHashId(dedupeKey(url)),
    url,
    title: str(raw.title) || titleFromUrl(url),
    folder: str(raw.folder, "Imported"),
    domain: domainOf(url),
    dedupeKey: dedupeKey(url),
    addDate: time(raw.addDate),
    importedAt: num(raw.importedAt, now),
    status,
    kept: raw.kept === true,
    note: str(raw.note),
    openCount: Math.max(0, Math.round(num(raw.openCount))),
    lastOpenedAt: time(raw.lastOpenedAt),
    deckCount: Math.max(0, Math.round(num(raw.deckCount))),
    lastDeckAt: time(raw.lastDeckAt),
    snoozedUntil: time(raw.snoozedUntil),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string").slice(0, 20) : [],
  };
}

function dbHashId(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/**
 * The one place rows come off disk into memory: every path (boot and cross-tab reload)
 * has to pass through sanitisation, and an id collision keeps both links instead of
 * silently hiding one.
 */
async function loadLibrary(): Promise<{ links: Map<string, SalvageLink>; repaired: number; dropped: number }> {
  const now = Date.now();
  const clean = new Map<string, SalvageLink>();
  let repaired = 0;
  let dropped = 0;
  for (const row of await db.allLinks()) {
    let ok = sanitizeLink(row, now);
    if (!ok) {
      dropped++;
      continue;
    }
    if (clean.has(ok.id)) {
      const base = ok.id;
      let n = 1;
      while (n < 1000 && clean.has(`${base}~${n}`)) n++;
      ok = { ...ok, id: `${base}~${n}` };
      repaired++;
      await db.putLink(ok);
    }
    clean.set(ok.id, ok);
  }
  return { links: clean, repaired, dropped };
}

export async function boot(): Promise<void> {
  try {
    state.settings = normaliseSettings(await db.getSettings({ ...DEFAULT_SETTINGS }));
    const now = Date.now();
    const [loaded, events] = await Promise.all([loadLibrary(), db.allEvents()]);
    state.links = loaded.links;
    state.events = events.filter((e) => e && typeof e.ts === "number").sort((a, b) => a.ts - b.ts);
    state.error = null;
    state.now = now;
    state.entitlement = getEntitlement(state.settings, now);
    if (loaded.repaired) state.lastAction = `Repaired ${loaded.repaired} link id collision${loaded.repaired === 1 ? "" : "s"} so nothing is hidden.`;
    if (loaded.dropped) state.lastAction = `Skipped ${loaded.dropped} unreadable record${loaded.dropped === 1 ? "" : "s"} from local storage.`;
    bumpLibrary();
    await refreshStreak();
    await ensureDeck();
    startDayRollover();
    startCrossTabSync();
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
  } finally {
    state.loading = false;
    emit();
  }
}

async function refreshStreak(): Promise<void> {
  const today = dateKeyOf(state.now);
  const streak = recomputeStreak(state.events, today, state.settings.lastSeenDate);
  if (streak !== state.settings.streakDays || state.settings.lastSeenDate !== today) {
    state.settings = { ...state.settings, streakDays: streak, lastSeenDate: today };
    await db.saveSettings(state.settings);
  }
}

/** Free plan is capped; Pro may choose any size up to 20, whatever settings say. */
export function allowedDeckSize(): number {
  return allowedDeckFor(state.entitlement, state.settings.deckSize);
}

function triagedToday(): boolean {
  if (!state.deck) return false;
  const start = new Date(`${state.deck.date}T00:00:00`).getTime();
  return state.events.some((e) => e.ts >= start && (e.type === "keep" || e.type === "toss" || e.type === "snooze" || e.type === "open" || e.type === "queue-done"));
}

async function ensureDeck(): Promise<void> {
  const today = dateKeyOf(state.now);
  const cut = allowedDeckSize();
  const existing = await db.getDeck(today);
  if (existing) {
    // A cut made while Pro was active must not keep out-sizing the plan after it lapses.
    if (existing.linkIds.length > cut) {
      const ids = existing.linkIds.slice(0, cut);
      const trimmed: DeckRecord = { ...existing, linkIds: ids, reasons: Object.fromEntries(ids.map((id) => [id, existing.reasons[id] ?? ""])) };
      await db.putDeck(trimmed);
      state.deck = trimmed;
      state.deckIndex = 0;
      state.lastAction = `Free plan deals at most ${FREE_DECK_SIZE} cards a day, so today's deck was trimmed from ${existing.linkIds.length} to ${cut}. Your library is untouched.`;
      return;
    }
    const live = existing.linkIds.filter((id) => state.links.get(id)?.status === "pile");
    if (live.length || !candidates().length) {
      state.deck = existing;
      state.deckIndex = 0;
      return;
    }
  }
  await cutDeck(today, cut);
}

async function cutDeck(today: string, cut: number): Promise<void> {
  const picks = buildDeck({
    links: [...state.links.values()],
    now: state.now,
    deckSize: cut,
    dateKey: today,
    libraryId: state.settings.libraryId,
  });
  const record: DeckRecord = {
    date: today,
    linkIds: picks.map((p) => p.linkId),
    reasons: Object.fromEntries(picks.map((p) => [p.linkId, p.reasons.slice(0, 3).join(" · ")])),
  };
  await db.putDeck(record);
  state.deck = record;
  state.deckIndex = 0;
  if (!record.linkIds.length) return;
  await logEvent({ ts: state.now, type: "deck-shown", count: record.linkIds.length });
  for (const id of record.linkIds) {
    const l = state.links.get(id);
    if (!l) continue;
    await patch(id, { deckCount: l.deckCount + 1, lastDeckAt: state.now });
  }
}

function candidates(): SalvageLink[] {
  return [...state.links.values()].filter((l) => l.status === "pile" && !(l.snoozedUntil !== null && l.snoozedUntil > state.now));
}

let rolloverTimer = 0;
function startDayRollover(): void {
  if (rolloverTimer) return;
  rolloverTimer = window.setInterval(() => {
    const today = dateKeyOf(Date.now());
    if (state.deck && state.deck.date !== today) {
      state.now = Date.now();
      void (async () => {
        await refreshStreak();
        await ensureDeck();
        emit();
      })();
    }
  }, 60_000);
}

let syncListenerInstalled = false;
function startCrossTabSync(): void {
  if (syncListenerInstalled) return;
  syncListenerInstalled = true;
      window.addEventListener("storage", (e) => {
    if (e.key !== SYNC_KEY) return;
    void (async () => {
      try {
        const now = Date.now();
        const [loaded, events] = await Promise.all([loadLibrary(), db.allEvents()]);
        state.links = loaded.links;
        state.events = events.sort((a, b) => a.ts - b.ts);
        state.settings = normaliseSettings(await db.getSettings(state.settings));
        state.externalChangeAt = now;
        state.now = now;
        bumpLibrary();
        await ensureDeck();
        emit();
      } catch (err) {
        state.error = err instanceof Error ? err.message : String(err);
        emit();
      }
    })();
  });

}

async function logEvent(ev: Omit<SalvageEvent, "id">): Promise<void> {
  const withId = db.makeEvent(ev);
  state.events.push(withId);
  try {
    await db.putEvent(withId);
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
  }
}

async function patch(id: string, changes: Partial<SalvageLink>, recordUndo?: string): Promise<boolean> {
  const before = state.links.get(id);
  if (!before) return false;
  let undoEntry: UndoEntry | null = null;
  if (recordUndo) {
    const prev: Partial<SalvageLink> = {};
    for (const k of Object.keys(changes) as (keyof SalvageLink)[]) (prev as Record<string, unknown>)[k] = before[k];
    undoEntry = { linkId: id, prev, label: recordUndo };
    state.undoStack.push(undoEntry);
    if (state.undoStack.length > 50) state.undoStack.shift();
  }
  const after = { ...before, ...changes };
  state.links.set(id, after);
  bumpLibrary();
  try {
    await db.putLink(after);
    // A successful write retires the storage warning; otherwise one hiccup haunts the user
    // until the next reload.
    state.error = null;
    return true;
  } catch (e) {
    state.links.set(id, before);
    if (undoEntry) state.undoStack = state.undoStack.filter((u) => u !== undoEntry);
    state.error = e instanceof Error ? e.message : String(e);
    bumpLibrary();
    return false;
  }
}

export function linkList(): SalvageLink[] {
  return [...state.links.values()];
}

export function currentCard(): SalvageLink | null {
  if (!state.deck) return null;
  for (let i = state.deckIndex; i < state.deck.linkIds.length; i++) {
    const l = state.links.get(state.deck.linkIds[i]);
    if (l && l.status === "pile" && !(l.snoozedUntil !== null && l.snoozedUntil > state.now)) return l;
  }
  return null;
}

export function deckPosition(): { index: number; total: number } {
  if (!state.deck) return { index: 0, total: 0 };
  const card = currentCard();
  if (!card) return { index: state.deck.linkIds.length, total: state.deck.linkIds.length };
  return { index: state.deck.linkIds.indexOf(card.id) + 1, total: state.deck.linkIds.length };
}

export function currentReasons(): string[] {
  const card = currentCard();
  if (!card || !state.deck) return [];
  return (state.deck.reasons[card.id] ?? "").split(" · ").filter(Boolean);
}

/** Import feedback lives in state: the render after ingest() replaces the DOM. */
export function recordImport(result: ImportResult): void {
  state.lastImport = result;
  state.lastImportError = null;
  emit();
}

export function recordImportError(message: string): void {
  state.lastImportError = message;
  emit();
}

export function canUndo(): boolean {
  return state.undoStack.length > 0;
}

/**
 * `openedWindow` must be the tab the caller already opened inside the click/keydown handler:
 * opening after the IndexedDB write resolves lets popup blockers swallow it silently.
 */
export async function triage(kind: "open" | "keep" | "snooze" | "toss", openedWindow?: Window | null): Promise<void> {
  const card = currentCard();
  if (!card) return;
  const now = Date.now();
  state.now = now;
  let ok = false;
  if (kind === "open") {
    const win = openedWindow === undefined ? window.open(card.url, "_blank", "noopener,noreferrer") : openedWindow;
    ok = await patch(card.id, { openCount: card.openCount + 1, lastOpenedAt: now, status: "queued" }, `opened “${short(card.title)}”`);
    if (ok) await logEvent({ ts: now, type: "open", linkId: card.id });
    if (!win) state.lastAction = "Your browser blocked the new tab — the address is shown under the title.";
  } else if (kind === "keep") {
    ok = await patch(card.id, { status: "queued", kept: true }, `kept “${short(card.title)}”`);
    if (ok) await logEvent({ ts: now, type: "keep", linkId: card.id });
  } else if (kind === "snooze") {
    ok = await patch(card.id, { snoozedUntil: now + Math.max(1, state.settings.snoozeDays) * DAY }, `snoozed “${short(card.title)}”`);
    if (ok) await logEvent({ ts: now, type: "snooze", linkId: card.id });
  } else {
    ok = await patch(card.id, { status: "tossed" }, `tossed “${short(card.title)}”`);
    if (ok) await logEvent({ ts: now, type: "toss", linkId: card.id });
  }
  if (!ok) {
    state.lastAction = "The browser refused that write — nothing was changed.";
    emit();
    return;
  }
  state.lastAction = null;
  if (state.deck) state.deckIndex = state.deck.linkIds.indexOf(card.id) + 1;
  await refreshStreak();
  pingOtherTabs();
  emit();
}

function short(t: string): string {
  const s = t.trim();
  return s.length > 42 ? `${s.slice(0, 41)}…` : s;
}

export async function undo(): Promise<string> {
  const entry = state.undoStack.pop();
  if (!entry) {
    state.lastAction = "Nothing to undo.";
    emit();
    return "Nothing to undo.";
  }
  const link = state.links.get(entry.linkId);
  if (!link) return "That link is no longer in the library.";
  const restored = { ...link, ...entry.prev };
  state.links.set(entry.linkId, restored);
  bumpLibrary();
  try {
    await db.putLink(restored);
  } catch (e) {
    state.links.set(entry.linkId, link);
    state.undoStack.push(entry);
    state.error = e instanceof Error ? e.message : String(e);
    emit();
    return "Undo failed: the browser refused the write.";
  }
  if (state.deck?.linkIds.includes(entry.linkId)) {
    state.deckIndex = Math.min(state.deckIndex, state.deck.linkIds.indexOf(entry.linkId));
  }
  state.lastAction = `Undid: ${entry.label}`;
  await logEvent({ ts: Date.now(), type: "undo", linkId: entry.linkId, detail: entry.label });
  await refreshStreak();
  pingOtherTabs();
  emit();
  return state.lastAction;
}

export async function markDone(id: string): Promise<void> {
  const link = state.links.get(id);
  if (!link) return;
  if (!(await patch(id, { status: "done" }, `finished “${short(link.title)}”`))) {
    emit();
    return;
  }
  await logEvent({ ts: Date.now(), type: "queue-done", linkId: id });
  state.lastAction = `Marked read: ${short(link.title)}`;
  await refreshStreak();
  pingOtherTabs();
  emit();
}

export async function setStatus(id: string, status: SalvageLink["status"]): Promise<void> {
  const link = state.links.get(id);
  if (!link) return;
  if (await patch(id, { status }, `set ${status} “${short(link.title)}”`)) pingOtherTabs();
  emit();
}

export async function setNote(id: string, note: string): Promise<void> {
  await patch(id, { note });
  pingOtherTabs();
  emit();
}

/** The cap is about links you are still carrying, so tossed rows do not eat into it. */
function activeLibraryCount(): number {
  let n = 0;
  for (const l of state.links.values()) if (l.status !== "tossed") n++;
  return n;
}

function freeHeadroom(): number {
  return state.entitlement.proActive || state.entitlement.linkLimit === null
    ? Infinity
    : Math.max(0, state.entitlement.linkLimit - activeLibraryCount());
}

export function libraryCounts(): { total: number; active: number } {
  return { total: state.links.size, active: activeLibraryCount() };
}

/** Hash ids are 36-bit: with 10k links a collision is likely enough to handle, not assume away. */
function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 1; n < 500; n++) if (!taken.has(`${base}~${n}`)) return `${base}~${n}`;
  return `${base}~${Date.now().toString(36)}`;
}

async function ingest(items: ParsedBookmark[], source: string, restore?: Map<string, Partial<SalvageLink>>): Promise<ImportResult> {
  const now = Date.now();
  const existingKeys = new Map([...state.links.values()].map((l) => [l.dedupeKey, l]));
  const taken = new Set(state.links.keys());
  const seenHere = new Set<string>();
  let invalid = 0;
  let skipped = 0;
  const fresh: SalvageLink[] = [];
  for (const item of items) {
    const url = canonicalUrl(item.url);
    const link = sanitizeLink({ url, title: item.title, folder: item.folder, addDate: item.addDate, tags: item.tags, note: item.note, importedAt: now }, now);
    if (!link) {
      invalid++;
      continue;
    }
    if (existingKeys.has(link.dedupeKey)) {
      skipped++;
      const mine = existingKeys.get(link.dedupeKey)!;
      if (restore?.get(mine.id)) {
        await patch(mine.id, restore.get(mine.id)!);
      }
      continue;
    }
    if (seenHere.has(link.dedupeKey)) {
      skipped++;
      continue;
    }
    seenHere.add(link.dedupeKey);
    link.id = uniqueId(link.id, taken);
    taken.add(link.id);
    fresh.push(link);
  }
  const room = freeHeadroom();
  const accepted = room === Infinity ? fresh : fresh.slice(0, room);
  const blocked = fresh.length - accepted.length;
  await db.bulkPutLinks(accepted);
  for (const l of accepted) state.links.set(l.id, l);
  bumpLibrary();
  const started = ensureTrialStarted(state.settings, now);
  if (started.started) {
    state.settings = started.settings;
    state.entitlement = getEntitlement(state.settings, now);
    await logEvent({ ts: now, type: "trial-start", detail: `${state.settings.trialLengthDays}-day Pro trial started` });
  }
  await db.saveSettings(state.settings);
  await logEvent({ ts: now, type: "import", count: accepted.length, detail: source });
  await ensureDeck();
  pingOtherTabs();
  emit();
  return { added: accepted.length, merged: skipped, skippedDuplicates: skipped, invalid, blockedByPlan: blocked, source };
}

export const importBookmarksHtml = (text: string, source = "bookmarks.html") => serial(() => ingest(parseBookmarksHtml(text), source));

export async function importUrlList(text: string): Promise<ImportResult> {
  const urls = text.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
  return serial(() => ingest(urls.map((url) => ({ url, title: "", folder: "Pasted", addDate: null, tags: [], note: "" })), "pasted links"));
}

/** A restored export is still an import: validated, capped, and merged into what is already here. */
export function importSnapshot(json: string): Promise<ImportResult> {
  return serial(async () => {
    const now = Date.now();
    const clean: SalvageLink[] = [];
    let invalid = 0;
    for (const raw of fromJson(json)) {
      const link = sanitizeLink(raw, now);
      if (!link) invalid++;
      else clean.push(link);
    }
    const restore = new Map<string, Partial<SalvageLink>>();
    const byKey = new Map(clean.map((l) => [l.dedupeKey, l]));
    for (const mine of state.links.values()) {
      const saved = byKey.get(mine.dedupeKey);
      if (!saved) continue;
      const diff: Partial<SalvageLink> = {};
      if (saved.status !== mine.status) diff.status = saved.status;
      if (saved.kept !== mine.kept) diff.kept = saved.kept;
      if (saved.note !== mine.note) diff.note = saved.note;
      if ((saved.openCount ?? 0) > mine.openCount) diff.openCount = saved.openCount;
      if (saved.lastOpenedAt && saved.lastOpenedAt > (mine.lastOpenedAt ?? 0)) diff.lastOpenedAt = saved.lastOpenedAt;
      if (Object.keys(diff).length) restore.set(mine.id, diff);
    }
    const items: ParsedBookmark[] = clean.map((l) => ({ url: l.url, title: l.title, folder: l.folder, addDate: l.addDate, tags: l.tags, note: l.note }));
    const result = await ingest(items, "salvage json", restore);
    return { ...result, invalid: result.invalid + invalid };
  });
}

export async function bulkTossDuplicates(keepId: string, dropIds: string[]): Promise<number> {
  let n = 0;
  for (const id of dropIds) {
    if (id === keepId) continue;
    const l = state.links.get(id);
    if (!l || l.status === "tossed") continue;
    if (await patch(id, { status: "tossed" }, `tossed duplicate “${short(l.title)}”`)) {
      await logEvent({ ts: Date.now(), type: "toss", linkId: id, detail: "duplicate" });
      n++;
    }
  }
  if (n) {
    state.lastAction = `Tossed ${n} duplicate${n === 1 ? "" : "s"}.`;
    await refreshStreak();
    pingOtherTabs();
  }
  emit();
  return n;
}

export async function renameFolder(from: string, to: string): Promise<number> {
  const target = to.trim();
  if (!target || target === from) return 0;
  let n = 0;
  for (const l of linkList()) {
    if (l.folder !== from) continue;
    if (await patch(l.id, { folder: target })) n++;
  }
  if (n) state.lastAction = `Renamed folder “${from}” → “${target}” for ${n} link${n === 1 ? "" : "s"}.`;
  pingOtherTabs();
  emit();
  return n;
}

export async function saveDeckSettings(deckSize: number, snoozeDays: number): Promise<{ deckSize: number; snoozeDays: number; appliesToday: boolean }> {
  const wanted = Math.min(20, Math.max(1, Math.round(deckSize) || 5));
  state.settings = normaliseSettings({ ...state.settings, deckSize: wanted, snoozeDays: Math.min(365, Math.max(1, Math.round(snoozeDays) || 7)) });
  const effective = allowedDeckSize();
  const appliesToday = !triagedToday() && Boolean(state.deck);
  await db.saveSettings(state.settings);
  if (appliesToday && state.deck) {
    if (effective !== state.deck.linkIds.length) await cutDeck(dateKeyOf(state.now), effective);
  }
  state.lastAction = appliesToday
    ? `Deck size saved: ${effective} cards a day, applied to today.`
    : `Deck size saved: ${effective} cards a day, from tomorrow's deck.`;
  emit();
  return { deckSize: effective, snoozeDays: state.settings.snoozeDays, appliesToday };
}

export function setRoute(route: Route): void {
  state.route = route;
  emit();
  if (route === "settings") void refreshStorageEstimate();
}

/**
 * Lives in state rather than in a captured DOM node: an async write into a node from a
 * previous render lands on a detached element and the line never updates.
 */
export async function refreshStorageEstimate(): Promise<void> {
  state.storage = await db.estimate();
  emit();
}

/** Arrow-key browsing inside today's cut; triaged cards are skipped by currentCard(). */
export function stepDeck(delta: number): void {
  if (!state.deck) return;
  const max = state.deck.linkIds.length - 1;
  state.deckIndex = Math.min(max, Math.max(0, state.deckIndex + delta));
  emit();
}

export function announceForDeck(): string {
  const card = currentCard();
  const pos = deckPosition();
  if (!card) return "Deck cleared for today. Import more, or come back tomorrow.";
  return `Card ${pos.index} of ${pos.total}: ${card.title}`;
}

export async function resetAll(): Promise<void> {
  await db.wipeEverything();
  state.links = new Map();
  state.events = [];
  state.deck = null;
  state.deckIndex = 0;
  state.undoStack = [];
  state.error = null;
  state.lastImport = null;
  state.lastImportError = null;
  state.lastAction = "Everything in this browser was deleted.";
  state.settings = normaliseSettings({ ...DEFAULT_SETTINGS });
  state.entitlement = getEntitlement(state.settings, Date.now());
  bumpLibrary();
  pingOtherTabs();
  emit();
}
