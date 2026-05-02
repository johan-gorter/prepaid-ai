/**
 * IndexedDB-backed handoff for image blobs between the renovations card,
 * the photo / crop pages, and the unified impression wizard.
 *
 * Keys:
 *  - "uncroppedImpressionSource": raw user image waiting to be cropped
 *  - "impressionSource":          1024² webp blob the wizard paints on
 *  - "impressionMask":            mask layer the wizard has painted so far
 *  - "impressionPromptDraft":     stringified { prompt, query } draft
 */

import { idbDelete, idbGet, idbSet } from "./useIdbStorage";

const KEY_SOURCE = "impressionSource";
const KEY_UNCROPPED = "uncroppedImpressionSource";
const KEY_MASK = "impressionMask";
const KEY_DRAFT = "impressionPromptDraft";

export const setImpressionSource = (b: Blob) => idbSet(KEY_SOURCE, b);
export const getImpressionSource = () => idbGet<Blob>(KEY_SOURCE);
export const clearImpressionSource = () => idbDelete(KEY_SOURCE);

export const setUncroppedSource = (b: Blob) => idbSet(KEY_UNCROPPED, b);
export const getUncroppedSource = () => idbGet<Blob>(KEY_UNCROPPED);
export const clearUncroppedSource = () => idbDelete(KEY_UNCROPPED);

export const setImpressionMask = (b: Blob) => idbSet(KEY_MASK, b);
export const getImpressionMask = () => idbGet<Blob>(KEY_MASK);
export const clearImpressionMask = () => idbDelete(KEY_MASK);

export interface ImpressionDraft {
  prompt: string;
  source?: string;
  renovation?: string | null;
  impression?: string | null;
}

export const setImpressionDraft = (d: ImpressionDraft) => idbSet(KEY_DRAFT, d);
export const getImpressionDraft = () => idbGet<ImpressionDraft>(KEY_DRAFT);
export const clearImpressionDraft = () => idbDelete(KEY_DRAFT);
