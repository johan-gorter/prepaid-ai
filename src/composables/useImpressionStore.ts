/**
 * IndexedDB-backed handoff for image blobs between the renovations card,
 * the photo / crop pages, and the unified impression wizard.
 *
 * Keys:
 *  - "uncroppedImpressionSource": raw user image waiting to be cropped
 *  - "impressionSource":          1024² webp blob the wizard paints on
 *  - "impressionMask":            mask layer the wizard has painted so far
 *  - "impressionPrompt":          stringified { prompt, query } draft
 */

const DB_NAME = "payasyougo-impressions";
const DB_VERSION = 1;
const STORE = "images";

const KEY_SOURCE = "impressionSource";
const KEY_UNCROPPED = "uncroppedImpressionSource";
const KEY_MASK = "impressionMask";
const KEY_DRAFT = "impressionPromptDraft";

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

async function get<T = Blob>(key: string): Promise<T | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown): Promise<void> {
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
export const getImpressionSource = () => get<Blob>(KEY_SOURCE);
export const clearImpressionSource = () => del(KEY_SOURCE);

export const setUncroppedSource = (b: Blob) => put(KEY_UNCROPPED, b);
export const getUncroppedSource = () => get<Blob>(KEY_UNCROPPED);
export const clearUncroppedSource = () => del(KEY_UNCROPPED);

export const setImpressionMask = (b: Blob) => put(KEY_MASK, b);
export const getImpressionMask = () => get<Blob>(KEY_MASK);
export const clearImpressionMask = () => del(KEY_MASK);

export interface ImpressionDraft {
  prompt: string;
  source?: string;
  renovation?: string | null;
  impression?: string | null;
}

export const setImpressionDraft = (d: ImpressionDraft) => put(KEY_DRAFT, d);
export const getImpressionDraft = () => get<ImpressionDraft>(KEY_DRAFT);
export const clearImpressionDraft = () => del(KEY_DRAFT);
