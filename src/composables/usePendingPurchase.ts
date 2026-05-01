/**
 * Pending credit purchase intent.
 *
 * When a user picks an amount on /buy-credits we stash the amount and the
 * follow-up route in IndexedDB so a sign-in detour and the round-trip to
 * the payment provider both survive. After the payment succeeds the app
 * navigates back to the original page where the user can re-press the
 * action button (Send / Generate) that triggered the buy flow.
 */

import { idbDelete, idbGet, idbSet } from "./useIdbStorage";

const KEY = "pendingPurchase";

export interface PendingPurchase {
  /** Credit amount the user committed to buying. */
  credits: number;
  /** Route to return to after the payment succeeds. */
  redirect: string;
}

export const setPendingPurchase = (p: PendingPurchase) => idbSet(KEY, p);
export const getPendingPurchase = () => idbGet<PendingPurchase>(KEY);
export const clearPendingPurchase = () => idbDelete(KEY);
