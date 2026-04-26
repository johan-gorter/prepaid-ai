/**
 * IndexedDB-backed handoff for image blobs between the renovations card,
 * the photo / crop pages, and the unified impression wizard.
 *
 * Keys:
 *  - "uncroppedImpressionSource": raw user image waiting to be cropped
 *  - "impressionSource":          1024² webp blob the wizard paints on
 */

const DB_NAME = "payasyougo-impressions";
const DB_VERSION = 1;
const STORE = "images";

const KEY_SOURCE = "impressionSource";
const KEY_UNCROPPED = "uncroppedImpressionSource";

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

async function get(key: string): Promise<Blob | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: Blob): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function del(key: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const setImpressionSource = (b: Blob) => put(KEY_SOURCE, b);
export const getImpressionSource = () => get(KEY_SOURCE);
export const clearImpressionSource = () => del(KEY_SOURCE);

export const setUncroppedSource = (b: Blob) => put(KEY_UNCROPPED, b);
export const getUncroppedSource = () => get(KEY_UNCROPPED);
export const clearUncroppedSource = () => del(KEY_UNCROPPED);
