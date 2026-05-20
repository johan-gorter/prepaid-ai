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
 *
 * Multi-tab note: the DB is shared across all tabs of the origin. Each open
 * connection registers `onversionchange` and closes itself when another tab
 * requests a version change, so the sign-out deleteDatabase isn't blocked by a
 * second tab still holding the DB open. If multi-tab delete-blocking ever
 * proves troublesome anyway, the agreed fallback is to *clear* the store's
 * contents in a normal readwrite transaction (which never blocks) rather than
 * deleteDatabase the whole thing.
 */

const DB_NAME = "payasyougo";
const DB_VERSION = 1;
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Yield to a version change requested by another tab — an upgrade, or the
      // deleteDatabase that sign-out's idbClearAll() runs. IndexedDB blocks
      // those behind every open connection, so if we kept this one open the
      // sign-out delete would be deferred — leaving the previous user's drafts,
      // masks, and cached URLs recoverable in the shared origin DB while this
      // tab stays open. Closing here lets the delete proceed; null the cached
      // promise so the next idbGet/idbSet transparently reopens.
      db.onversionchange = () => {
        db.close();
        if (dbPromise === pending) dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    // A version change blocked by another live connection — commonly a second
    // tab still holding the DB open, or a deleteDatabase pending from sign-out —
    // leaves the open request pending indefinitely: neither onsuccess nor
    // onerror ever fires. Reject instead of hanging so callers fail fast.
    req.onblocked = () =>
      reject(new DOMException("IndexedDB open blocked", "InvalidStateError"));
  });
  // Never leave a rejected promise cached: a transient block or error would
  // otherwise poison every future open() for the page's lifetime. Drop it so
  // the next call retries (e.g. once the blocking tab closes).
  pending.catch(() => {
    if (dbPromise === pending) dbPromise = null;
  });
  dbPromise = pending;
  return pending;
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

/**
 * Read a key but never block longer than `timeoutMs`. Used on the cold-start
 * "resume last page" redirect path so a stalled IndexedDB open (a blocked
 * version change, a half-open connection left after sign-out, a private-mode
 * quirk) can never strand the app on a redirect gate. The common case resolves
 * in single-digit milliseconds; the timeout only fires in the pathological
 * hang, falling through to `null` instead of an eternal wait.
 */
export function idbGetFast<T = unknown>(
  key: string,
  timeoutMs = 500,
): Promise<T | null> {
  return Promise.race([
    idbGet<T>(key).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
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
