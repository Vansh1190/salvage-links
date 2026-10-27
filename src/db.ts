import type { DeckRecord, SalvageEvent, SalvageLink, Settings } from "./model.ts";

const DB_NAME = "salvage";
const DB_VERSION = 1;

export const STORE_LINKS = "links";
export const STORE_EVENTS = "events";
export const STORE_DECKS = "decks";
export const STORE_META = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_LINKS)) {
        const links = db.createObjectStore(STORE_LINKS, { keyPath: "id" });
        links.createIndex("dedupeKey", "dedupeKey", { unique: false });
        links.createIndex("status", "status", { unique: false });
        links.createIndex("domain", "domain", { unique: false });
        links.createIndex("addDate", "addDate", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        const ev = db.createObjectStore(STORE_EVENTS, { keyPath: "ts" });
        ev.createIndex("type", "type", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DECKS)) {
        db.createObjectStore(STORE_DECKS, { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB blocked by another open tab"));
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
      }),
  );
}

export function txDone(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => void): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(store, mode);
        fn(t.objectStore(store));
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error("IndexedDB transaction failed"));
        t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"));
      }),
  );
}

export const getLink = (id: string) => tx<SalvageLink | undefined>(STORE_LINKS, "readonly", (s) => s.get(id) as IDBRequest<SalvageLink | undefined>);
export const putLink = (link: SalvageLink) => txDone(STORE_LINKS, "readwrite", (s) => void s.put(link));
export const deleteLink = (id: string) => txDone(STORE_LINKS, "readwrite", (s) => void s.delete(id));
export const allLinks = () => tx<SalvageLink[]>(STORE_LINKS, "readonly", (s) => s.getAll() as IDBRequest<SalvageLink[]>);
export const countLinks = () => tx<number>(STORE_LINKS, "readonly", (s) => s.count());
export const countEvents = () => tx<number>(STORE_EVENTS, "readonly", (s) => s.count());
export const putEvent = (ev: SalvageEvent) => txDone(STORE_EVENTS, "readwrite", (s) => void s.put(ev));
export const allEvents = () => tx<SalvageEvent[]>(STORE_EVENTS, "readonly", (s) => s.getAll() as IDBRequest<SalvageEvent[]>);
export const getDeck = (date: string) => tx<DeckRecord | undefined>(STORE_DECKS, "readonly", (s) => s.get(date) as IDBRequest<DeckRecord | undefined>);
export const putDeck = (deck: DeckRecord) => txDone(STORE_DECKS, "readwrite", (s) => void s.put(deck));
export const allDecks = () => tx<DeckRecord[]>(STORE_DECKS, "readonly", (s) => s.getAll() as IDBRequest<DeckRecord[]>);

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await tx<{ key: string; value: unknown } | undefined>(STORE_META, "readonly", (s) => s.get(key));
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

export async function wipeEverything(): Promise<void> {
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("deleteDatabase failed"));
    req.onblocked = () => resolve();
  });
}

export async function estimate(): Promise<{ usage: number; quota: number; persisted: boolean }> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0, persisted: false };
  const est = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted };
}

export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
