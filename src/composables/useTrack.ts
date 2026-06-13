/**
 * Anonymous funnel & viral-loop measurement (issue #93).
 *
 * `track(event)` fires a fire-and-forget callable to the `trackEvent` Cloud
 * Function, which increments an aggregate `{event, source, day}` counter in
 * Firestore. See docs/measurement.md for the principles: no consent banner, no
 * third-party trackers, no persistent device identifiers, no PII — just
 * anonymous per-step counters so we can see where people drop off and whether
 * the viral loop works.
 *
 * Invariants kept here:
 *  - Events are a **fixed enum** (`TRACK_EVENTS`). The server validates against
 *    the same list, so nothing free-form (URLs, screen sizes, prompts) can ever
 *    be smuggled into the counters.
 *  - `track()` never throws and never blocks the user flow. Measurement is
 *    best-effort; dropped beacons (offline, errors) are acceptable — counters
 *    are for trends, not bookkeeping.
 *  - The viral/marketing **source** is carried in the URL and held in memory
 *    only (decision 2 in docs/measurement.md). No device storage, so no
 *    consent is needed; it is lost on a full page reload, which we accept.
 */

import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

// Fixed event enum. KEEP IN SYNC with functions/src/trackEvent.ts TRACK_EVENTS.
export const TRACK_EVENTS = [
  // Funnel steps (landing → share), in order.
  "landing_view",
  "cta_click",
  "photo_chosen",
  "mask_done",
  "action_chosen",
  "generate_click",
  "paywall_view",
  "amount_chosen",
  "login_done",
  "payment_done",
  "result_view",
  "next_edit",
  "share_created",
  // Viral loop.
  "share_visit",
  // Quality & health proxies.
  "generate_fail",
  "impression_trashed",
] as const;

export type TrackEvent = (typeof TRACK_EVENTS)[number];

/**
 * First-touch viral/marketing source, carried in the URL (`?src=…`) or implied
 * by a `/share/:token` link. In-memory only and locked on first sight so the
 * whole funnel a visitor walks is attributed to where they came from. Defaults
 * to "direct". Validated against the same allowlist as the server.
 */
let currentSource = "direct";
let sourceLocked = false;

// Allowed non-default sources: an organic share, or a future invite/influencer
// code (`inv-<code>`). Anything else is ignored and stays "direct" so a crafted
// URL can't spray arbitrary labels into the counters.
const SOURCE_RE = /^(share|inv-[a-z0-9]{1,32})$/;

export function setTrackSource(raw: string | null | undefined): void {
  if (sourceLocked) return;
  if (typeof raw !== "string" || !SOURCE_RE.test(raw)) return;
  currentSource = raw;
  sourceLocked = true;
}

type TrackCallable = (data: { event: string; source: string }) => Promise<unknown>;

let callable: TrackCallable | null = null;

export function track(event: TrackEvent): void {
  try {
    if (!callable) {
      callable = httpsCallable(functions, "trackEvent") as TrackCallable;
    }
    // Fire-and-forget: never await, swallow every failure. A broken or slow
    // counter must never surface to the user or block navigation.
    void callable({ event, source: currentSource }).catch(() => {});
  } catch {
    // ignore — best-effort only
  }
}
