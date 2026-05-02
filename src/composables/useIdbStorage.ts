/**
 * Unified IndexedDB-backed key-value store for the app.
 *
 * Replaces window.localStorage everywhere so all client-side persistence
 * lives in one place. Values can be Blobs (for image/mask handoff between
 * pages) or arbitrary JSON-serialisable objects (for drafts, caches and
 * pending-purchase intents).
 *
 * One database, one object store, keyed by string. Drop the whole database
 * on sign-out so a different user on the same device can't recover the
 * previous user's drafts, masks, or cached state.
 */

const DB_NAME = "payasyougo";
const DB_VERSION = 1;
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function idbGet<T = unknown>(key: string): Promise<T | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function idbDelete(key: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Pre-migration databases that earlier builds wrote into. We delete these
// alongside the unified store so a returning user on a device that still
// has those legacy IDBs around cannot recover the previous session's data.
const LEGACY_DB_NAMES = ["payasyougo-impressions"];

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/**
 * Drop the entire app database. Used on sign-out so a different user on the
 * same device can't recover drafts, cached URLs, or in-progress purchases.
 *
 * Closes the cached connection first because IndexedDB blocks deletion while
 * any tab still holds the database open.
 */
export async function idbClearAll(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      // ignore: a failed open is already cleared with the reset below
    }
    dbPromise = null;
  }
  await Promise.all(
    [DB_NAME, ...LEGACY_DB_NAMES].map((name) => deleteDatabase(name)),
  );
}
