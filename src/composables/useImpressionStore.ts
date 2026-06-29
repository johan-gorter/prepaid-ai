/**
 * IndexedDB-backed handoff for image blobs between the renovations card,
 * the photo / crop pages, and the unified impression wizard.
 *
 * Keys:
 *  - "uncroppedImpressionSource": raw user image waiting to be cropped
 *  - "impressionSource":          1024² webp blob the wizard paints on
 *  - "impressionMask":            mask layer the wizard has painted so far
 *  - "impressionPromptDraft":     stringified { prompt, query } draft
 *  - "referenceSource:<kind>":    1024² webp blob of a freshly chosen reference
 *                                 image (apply-material / add-furniture flows),
 *                                 kept so a buy-credits / sign-in detour at
 *                                 Generate can restore the selection before it
 *                                 is uploaded
 */

import { idbDelete, idbGet, idbSet } from "./useIdbStorage";
import type { ReferenceKind } from "../data/referenceImageRepo";

const KEY_SOURCE = "impressionSource";
const KEY_UNCROPPED = "uncroppedImpressionSource";
const KEY_MASK = "impressionMask";
const KEY_DRAFT = "impressionPromptDraft";
const referenceKey = (kind: ReferenceKind) => `referenceSource:${kind}`;

export const setImpressionSource = (b: Blob) => idbSet(KEY_SOURCE, b);
export const getImpressionSource = () => idbGet<Blob>(KEY_SOURCE);
export const clearImpressionSource = () => idbDelete(KEY_SOURCE);

export const setUncroppedSource = (b: Blob) => idbSet(KEY_UNCROPPED, b);
export const getUncroppedSource = () => idbGet<Blob>(KEY_UNCROPPED);
export const clearUncroppedSource = () => idbDelete(KEY_UNCROPPED);

export const setReferenceSource = (kind: ReferenceKind, b: Blob) =>
  idbSet(referenceKey(kind), b);
export const getReferenceSource = (kind: ReferenceKind) =>
  idbGet<Blob>(referenceKey(kind));
export const clearReferenceSource = (kind: ReferenceKind) =>
  idbDelete(referenceKey(kind));

/** Drop every kind's freshly-chosen reference blob (used on flow reset). */
export const clearAllReferenceSources = () =>
  Promise.all([
    clearReferenceSource("material"),
    clearReferenceSource("furniture"),
  ]);

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
  // Set when the wizard is driving a reference-image action ("Apply material"
  // or "Add furniture"), so a buy-credits / sign-in detour resumes the right
  // stage. The chosen reference is either an already-uploaded registry path
  // (`referencePath`) or the freshly captured blob stashed under the
  // "referenceSource:<kind>" IDB key.
  referenceKind?: ReferenceKind;
  referencePath?: string;
}

export const setImpressionDraft = (d: ImpressionDraft) => idbSet(KEY_DRAFT, d);
export const getImpressionDraft = () => idbGet<ImpressionDraft>(KEY_DRAFT);
export const clearImpressionDraft = () => idbDelete(KEY_DRAFT);
