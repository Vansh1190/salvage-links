import type { DeckRecord, SalvageEvent, SalvageLink, Settings } from "./model.ts";

const DB_NAME = "salvage";
const DB_VERSION = 2;

export const STORE_LINKS = "links";
export const STORE_EVENTS = "events";
export const STORE_DECKS = "decks";
export const STORE_META = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;
/** Last storage failure, surfaced in the UI instead of silently diverging from memory. */
let lastWriteError: string | null = null;

export function writeError(): string | null {
  return lastWriteError;
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      const transaction = req.transaction;
      if (!transaction) return;
      if (!db.objectStoreNames.contains(STORE_LINKS)) {
        const links = db.createObjectStore(STORE_LINKS, { keyPath: "id" });
        links.createIndex("dedupeKey", "dedupeKey", { unique: false });
        links.createIndex("status", "status", { unique: false });
        links.createIndex("domain", "domain", { unique: false });
        links.createIndex("addDate", "addDate", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        const ev = db.createObjectStore(STORE_EVENTS, { keyPath: "id" });
        ev.createIndex("type", "type", { unique: false });
        ev.createIndex("ts", "ts", { unique: false });
      } else if (transaction.objectStore(STORE_EVENTS).keyPath !== "id") {
        // v1 keyed events on ts alone, which silently overwrote same-millisecond events.
        db.deleteObjectStore(STORE_EVENTS);
        const ev = db.createObjectStore(STORE_EVENTS, { keyPath: "id" });
        ev.createIndex("type", "type", { unique: false });
        ev.createIndex("ts", "ts", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DECKS)) db.createObjectStore(STORE_DECKS, { keyPath: "date" });
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: "key" });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("IndexedDB open failed"));
    };
    req.onblocked = () => {
      dbPromise = null;
      reject(new Error("IndexedDB is blocked by another tab still holding the old version. Close that tab and retry."));
    };
  });
  return dbPromise;
}

function fail(e: unknown): void {
  lastWriteError = e instanceof Error ? e.message : String(e);
}

function tx1<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let t: IDBTransaction;
        try {
          t = db.transaction(store, mode);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
          return;
        }
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          fail(req.error);
          reject(req.error ?? new Error("IndexedDB request failed"));
        };
      }),
  );
}

export function txDone(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => void): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        let t: IDBTransaction;
        try {
          t = db.transaction(store, mode);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
          return;
        }
        fn(t.objectStore(store));
        t.oncomplete = () => resolve();
        t.onerror = () => {
          fail(t.error);
          reject(t.error ?? new Error("IndexedDB transaction failed"));
        };
        t.onabort = () => {
          fail(t.error);
          reject(t.error ?? new Error("IndexedDB transaction aborted"));
        };
      }),
  );
}

export const getLink = (id: string) => tx1<SalvageLink | undefined>(STORE_LINKS, "readonly", (s) => s.get(id) as IDBRequest<SalvageLink | undefined>);
export const putLink = (link: SalvageLink) => txDone(STORE_LINKS, "readwrite", (s) => void s.put(link));
export const allLinks = () => tx1<SalvageLink[]>(STORE_LINKS, "readonly", (s) => s.getAll() as IDBRequest<SalvageLink[]>);
export const countLinks = () => tx1<number>(STORE_LINKS, "readonly", (s) => s.count());
export const getDeck = (date: string) => tx1<DeckRecord | undefined>(STORE_DECKS, "readonly", (s) => s.get(date) as IDBRequest<DeckRecord | undefined>);
export const putDeck = (deck: DeckRecord) => txDone(STORE_DECKS, "readwrite", (s) => void s.put(deck));
export const allDecks = () => tx1<DeckRecord[]>(STORE_DECKS, "readonly", (s) => s.getAll() as IDBRequest<DeckRecord[]>);

let eventSeq = 0;
export function makeEvent(ev: Omit<SalvageEvent, "id">): SalvageEvent & { id: string } {
  eventSeq += 1;
  return { ...ev, id: `${ev.ts}-${eventSeq.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}` };
}

export const putEvent = (ev: SalvageEvent & { id?: string }) =>
  txDone(STORE_EVENTS, "readwrite", (s) => void s.put({ ...ev, id: ev.id ?? `${ev.ts}-${Math.random().toString(36).slice(2)}` }));

export const allEvents = () => tx1<(SalvageEvent & { id: string })[]>(STORE_EVENTS, "readonly", (s) => s.getAll() as IDBRequest<(SalvageEvent & { id: string })[]>);

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await tx1<{ key: string; value: unknown } | undefined>(STORE_META, "readonly", (s) => s.get(key));
  return row === undefined ? fallback : (row.value as T);
}

export function setMeta<T>(key: string, value: T): Promise<void> {
  return txDone(STORE_META, "readwrite", (s) => void s.put({ key, value }));
}

export function getSettings(fallback: Settings): Promise<Settings> {
  return getMeta<Settings>("settings", fallback);
}

export function saveSettings(s: Settings): Promise<void> {
  return setMeta("settings", s);
}

export async function bulkPutLinks(links: SalvageLink[]): Promise<void> {
  if (!links.length) return;
  await txDone(STORE_LINKS, "readwrite", (s) => {
    for (const l of links) s.put(l);
  });
}

/** Closes our own connection first, then deletes; never reports success on a blocked delete. */
export async function wipeEverything(): Promise<void> {
  const db = dbPromise ? await dbPromise.catch(() => null) : null;
  db?.close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("deleteDatabase failed"));
    req.onblocked = () => reject(new Error("Could not delete: another tab is holding the database open."));
  });
}

export async function estimate(): Promise<{ usage: number; quota: number; persisted: boolean; error: string | null }> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0, persisted: false, error: null };
  try {
    const est = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted, error: null };
  } catch (e) {
    return { usage: 0, quota: 0, persisted: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
