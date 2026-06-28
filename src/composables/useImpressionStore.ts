/**
 * IndexedDB-backed handoff for image blobs between the renovations card,
 * the photo / crop pages, and the unified impression wizard.
 *
 * Keys:
 *  - "uncroppedImpressionSource": raw user image waiting to be cropped
 *  - "impressionSource":          1024² webp blob the wizard paints on
 *  - "impressionMask":            mask layer the wizard has painted so far
 *  - "impressionPromptDraft":     stringified { prompt, query } draft
 *  - "materialSource":            1024² webp blob of a freshly chosen material
 *                                 reference (apply-material flow), kept so a
 *                                 buy-credits / sign-in detour at Generate can
 *                                 restore the selection before it is uploaded
 */

import { idbDelete, idbGet, idbSet } from "./useIdbStorage";

const KEY_SOURCE = "impressionSource";
const KEY_UNCROPPED = "uncroppedImpressionSource";
const KEY_MASK = "impressionMask";
const KEY_DRAFT = "impressionPromptDraft";
const KEY_MATERIAL = "materialSource";

export const setImpressionSource = (b: Blob) => idbSet(KEY_SOURCE, b);
export const getImpressionSource = () => idbGet<Blob>(KEY_SOURCE);
export const clearImpressionSource = () => idbDelete(KEY_SOURCE);

export const setUncroppedSource = (b: Blob) => idbSet(KEY_UNCROPPED, b);
export const getUncroppedSource = () => idbGet<Blob>(KEY_UNCROPPED);
export const clearUncroppedSource = () => idbDelete(KEY_UNCROPPED);

export const setMaterialSource = (b: Blob) => idbSet(KEY_MATERIAL, b);
export const getMaterialSource = () => idbGet<Blob>(KEY_MATERIAL);
export const clearMaterialSource = () => idbDelete(KEY_MATERIAL);

export const setImpressionMask = (b: Blob) => idbSet(KEY_MASK, b);
export const getImpressionMask = () => idbGet<Blob>(KEY_MASK);
export const clearImpressionMask = () => idbDelete(KEY_MASK);

export interface ImpressionDraft {
  prompt: string;
  source?: string;
  renovation?: string | null;
  impression?: string | null;
  // True when the wizard was driving the "Verwijderen" action, so the
  // composite must use a solid magenta fill instead of the checkerboard
  // pattern. Persisted so a buy-credits / sign-in detour preserves the
  // intent.
  solidMask?: boolean;
  // Set when the wizard is driving the "Schilder" (paint) action — the
  // chosen "#RRGGBB" colour. Presence implies paint mode. Persisted so a
  // buy-credits / sign-in detour preserves the chosen colour.
  paintColor?: string;
  // True when the wizard is driving the "Apply material" action, so a
  // buy-credits / sign-in detour resumes the material stage. The chosen
  // material is either an already-uploaded registry path (`materialPath`) or
  // the freshly captured blob stashed under the "materialSource" IDB key.
  materialMode?: boolean;
  materialPath?: string;
}

export const setImpressionDraft = (d: ImpressionDraft) => idbSet(KEY_DRAFT, d);
export const getImpressionDraft = () => idbGet<ImpressionDraft>(KEY_DRAFT);
export const clearImpressionDraft = () => idbDelete(KEY_DRAFT);
