import * as db from "./db.ts";
import { parseBookmarksHtml, toLinks, type ParsedBookmark } from "./bookmarks.ts";
import { buildDeck, dateKeyOf } from "./resurfacer.ts";
import { DEFAULT_SETTINGS, type DeckRecord, type SalvageEvent, type SalvageLink, type Settings } from "./model.ts";
import { ensureTrialStarted, getEntitlement, type Entitlement } from "./trial.ts";
import { recomputeStreak } from "./stats.ts";
import { fromJson } from "./exporters.ts";

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
  events: SalvageEvent[];
  settings: Settings;
  entitlement: Entitlement;
  deck: DeckRecord | null;
  deckIndex: number;
  undoStack: UndoEntry[];
  now: number;
  route: Route;
  query: string;
  loading: boolean;
  error: string | null;
  lastImport: ImportResult | null;
  lastImportError: string | null;
}

const listeners = new Set<(s: Store) => void>();

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
};

/** Import feedback has to live in state: the render after ingest() replaces the DOM. */
export function recordImport(result: ImportResult): void {
  state.lastImport = result;
  state.lastImportError = null;
  emit();
}

export function recordImportError(message: string): void {
  state.lastImportError = message;
  emit();
}

export function subscribe(fn: (s: Store) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  state.now = Date.now();
  state.entitlement = getEntitlement(state.settings, state.now);
  for (const fn of listeners) fn(state);
}

export async function boot(): Promise<void> {
  try {
    state.settings = await db.getSettings({ ...DEFAULT_SETTINGS });
    state.links = new Map((await db.allLinks()).map((l) => [l.id, l]));
    state.events = (await db.allEvents()).sort((a, b) => a.ts - b.ts);
    await refreshStreak();
    await ensureDeck();
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
  const isNewDay = state.settings.lastSeenDate !== today;
  if (streak !== state.settings.streakDays || isNewDay) {
    state.settings = { ...state.settings, streakDays: streak, lastSeenDate: today };
    await db.saveSettings(state.settings);
  }
}

async function ensureDeck(): Promise<void> {
  const today = dateKeyOf(state.now);
  const existing = await db.getDeck(today);
  const candidates = linkList().filter((l) => l.status === "pile" && !(l.snoozedUntil !== null && l.snoozedUntil > state.now));
  if (existing) {
    const live = existing.linkIds.filter((id) => state.links.get(id)?.status === "pile");
    // A deck stored before the library had anything in it must not lock the day.
    if (live.length || !candidates.length) {
      state.deck = { ...existing, linkIds: live, reasons: Object.fromEntries(live.map((id) => [id, existing.reasons[id] ?? ""])) };
      state.deckIndex = 0;
      return;
    }
  }
  const deckSize = state.entitlement.deckSize;
  const picks = buildDeck({
    links: [...state.links.values()],
    now: state.now,
    deckSize,
    dateKey: today,
    libraryId: state.settings.libraryId,
  });
  const record: DeckRecord = {
    date: today,
    linkIds: picks.map((p) => p.linkId),
    reasons: Object.fromEntries(picks.map((p) => [p.linkId, p.reasons.join(" · ")])),
  };
  await db.putDeck(record);
  state.deck = record;
  state.deckIndex = 0;
  if (record.linkIds.length) {
    await logEvent({ ts: state.now, type: "deck-shown", count: record.linkIds.length });
    for (const id of record.linkIds) {
      const l = state.links.get(id);
      if (!l) continue;
      await patch(id, { deckCount: l.deckCount + 1, lastDeckAt: state.now });
    }
  }
}

async function logEvent(ev: SalvageEvent): Promise<void> {
  state.events.push(ev);
  await db.putEvent(ev);
}

async function patch(id: string, changes: Partial<SalvageLink>, recordUndo?: string): Promise<void> {
  const link = state.links.get(id);
  if (!link) return;
  if (recordUndo) {
    const prev: Partial<SalvageLink> = {};
    for (const k of Object.keys(changes) as (keyof SalvageLink)[]) {
      (prev as Record<string, unknown>)[k] = link[k];
    }
    state.undoStack.push({ linkId: id, prev, label: recordUndo });
    if (state.undoStack.length > 50) state.undoStack.shift();
  }
  const next = { ...link, ...changes };
  state.links.set(id, next);
  await db.putLink(next);
}

export function linkList(): SalvageLink[] {
  return [...state.links.values()];
}

export function currentCard(): SalvageLink | null {
  if (!state.deck) return null;
  const id = state.deck.linkIds[state.deckIndex];
  if (!id) return null;
  return state.links.get(id) ?? null;
}

export function currentReasons(): string[] {
  const card = currentCard();
  if (!card || !state.deck) return [];
  return (state.deck.reasons[card.id] ?? "").split(" · ").filter(Boolean);
}

export async function triage(kind: "open" | "keep" | "snooze" | "toss"): Promise<void> {
  const card = currentCard();
  if (!card) return;
  const now = state.now;
  if (kind === "open") {
    window.open(card.url, "_blank", "noopener,noreferrer");
    await patch(card.id, { openCount: card.openCount + 1, lastOpenedAt: now }, "opened");
    await logEvent({ ts: now, type: "open", linkId: card.id });
    if (card.status === "pile") await patch(card.id, { status: "queued" });
  } else if (kind === "keep") {
    await patch(card.id, { status: "queued", kept: true }, "kept");
    await logEvent({ ts: now, type: "keep", linkId: card.id });
  } else if (kind === "snooze") {
    const until = now + Math.max(1, state.settings.snoozeDays) * 86_400_000;
    await patch(card.id, { snoozedUntil: until }, "snoozed");
    await logEvent({ ts: now, type: "snooze", linkId: card.id });
  } else {
    await patch(card.id, { status: "tossed" }, "tossed");
    await logEvent({ ts: now, type: "toss", linkId: card.id });
  }
  await advance();
  await refreshStreak();
  emit();
}

async function advance(): Promise<void> {
  if (!state.deck) return;
  if (state.deckIndex < state.deck.linkIds.length - 1) state.deckIndex++;
}

export async function undo(): Promise<string> {
  const entry = state.undoStack.pop();
  if (!entry) return "Nothing to undo.";
  await patch(entry.linkId, entry.prev);
  await logEvent({ ts: state.now, type: "undo", linkId: entry.linkId, detail: entry.label });
  await refreshStreak();
  emit();
  return `Undid: ${entry.label}`;
}

export async function markDone(id: string): Promise<void> {
  const link = state.links.get(id);
  if (!link) return;
  await patch(id, { status: "done" }, `marked done: ${link.title.slice(0, 40)}`);
  await logEvent({ ts: state.now, type: "queue-done", linkId: id });
  await refreshStreak();
  emit();
}

export async function setStatus(id: string, status: SalvageLink["status"]): Promise<void> {
  const link = state.links.get(id);
  if (!link) return;
  await patch(id, { status }, `set ${status}: ${link.title.slice(0, 40)}`);
  emit();
}

export async function setNote(id: string, note: string): Promise<void> {
  await patch(id, { note });
  emit();
}

async function ingest(items: ParsedBookmark[], source: string): Promise<ImportResult> {
  const existingKeys = new Set(linkList().map((l) => l.dedupeKey));
  const { links, skipped, invalid } = toLinks(items, { now: state.now, libraryId: state.settings.libraryId });
  const fresh = links.filter((l) => !existingKeys.has(l.dedupeKey));
  const merged = links.length - fresh.length;
  let blocked = 0;
  let accepted = fresh;
  if (!state.entitlement.proActive && state.entitlement.linkLimit !== null) {
    const room = Math.max(0, state.entitlement.linkLimit - state.links.size);
    blocked = Math.max(0, fresh.length - room);
    accepted = fresh.slice(0, room);
  }
  await db.bulkPutLinks(accepted);
  for (const l of accepted) state.links.set(l.id, l);
  const started = ensureTrialStarted(state.settings, state.now);
  if (started.started) {
    state.settings = started.settings;
    await logEvent({ ts: state.now, type: "trial-start", detail: "40-day Pro trial started" });
  }
  await db.saveSettings(state.settings);
  await logEvent({ ts: state.now, type: "import", count: accepted.length, detail: source });
  await ensureDeck();
  emit();
  return { added: accepted.length, merged, skippedDuplicates: skipped, invalid, blockedByPlan: blocked, source };
}

export const importBookmarksHtml = (text: string, source = "bookmarks.html") => ingest(parseBookmarksHtml(text), source);

export async function importUrlList(text: string): Promise<ImportResult> {
  const urls = text.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
  return ingest(
    urls.map((url) => ({ url, title: "", folder: "Pasted", addDate: null, tags: [] } as ParsedBookmark)),
    "pasted urls",
  );
}

export async function importSnapshot(json: string): Promise<ImportResult> {
  const links = fromJson(json);
  const existing = new Set(linkList().map((l) => l.dedupeKey));
  let added = 0;
  let merged = 0;
  const restored: SalvageLink[] = [];
  for (const l of links) {
    if (existing.has(l.dedupeKey)) {
      merged++;
      continue;
    }
    restored.push(l);
    added++;
  }
  await db.bulkPutLinks(restored);
  for (const l of restored) state.links.set(l.id, l);
  const started = ensureTrialStarted(state.settings, state.now);
  if (started.started) state.settings = started.settings;
  await db.saveSettings(state.settings);
  await logEvent({ ts: state.now, type: "import", count: added, detail: "salvage json" });
  await ensureDeck();
  emit();
  return { added, merged, skippedDuplicates: 0, invalid: 0, blockedByPlan: 0, source: "salvage json" };
}

export async function bulkTossDuplicates(keepId: string, dropIds: string[]): Promise<number> {
  let n = 0;
  for (const id of dropIds) {
    if (id === keepId) continue;
    const l = state.links.get(id);
    if (!l) continue;
    await patch(id, { status: "tossed" }, `duplicate of ${keepId}`);
    await logEvent({ ts: state.now, type: "toss", linkId: id, detail: "duplicate" });
    n++;
  }
  emit();
  return n;
}

export async function renameFolder(from: string, to: string): Promise<number> {
  let n = 0;
  for (const l of linkList()) {
    if (l.folder !== from) continue;
    await patch(l.id, { folder: to });
    n++;
  }
  emit();
  return n;
}

export function setRoute(route: Route): void {
  state.route = route;
  emit();
}

export async function resetAll(): Promise<void> {
  await db.wipeEverything();
  state.links = new Map();
  state.events = [];
  state.deck = null;
  state.deckIndex = 0;
  state.undoStack = [];
  state.settings = { ...DEFAULT_SETTINGS };
  emit();
}
