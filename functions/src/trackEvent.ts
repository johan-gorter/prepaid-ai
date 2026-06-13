/**
 * Anonymous funnel & viral-loop counter endpoint (issue #93).
 *
 * Validates a fixed event enum + a bounded source label, then atomically
 * increments a single aggregate doc per `{event, source, day}` in the
 * `metrics` collection. See docs/measurement.md.
 *
 * Privacy invariants:
 *  - The function stores **no PII**: no uid, no IP address, no user agent.
 *    Only the validated enum event, an allowlisted source, the UTC day, and a
 *    running count are written.
 *  - Unknown/invalid input is dropped silently (the client beacon is
 *    fire-and-forget) rather than erroring.
 *  - Callable is intentionally open to unauthenticated visitors — the funnel
 *    starts before login.
 */

import { FieldValue } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { db } from "./admin.js";
import { FUNCTIONS_REGION } from "./region.js";

// Fixed event enum. KEEP IN SYNC with src/composables/useTrack.ts TRACK_EVENTS.
const TRACK_EVENTS = new Set<string>([
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
  "share_visit",
  "generate_fail",
  "impression_trashed",
]);

// "direct" (default), an organic "share", or a future "inv-<code>". Anything
// else is bucketed as "direct" so the counters can't be polluted with
// arbitrary labels from a crafted URL.
const SOURCE_RE = /^(direct|share|inv-[a-z0-9]{1,32})$/;

export const trackEvent = onCall({ region: FUNCTIONS_REGION }, async (request) => {
  const data = (request.data ?? {}) as { event?: unknown; source?: unknown };

  const event = data.event;
  if (typeof event !== "string" || !TRACK_EVENTS.has(event)) {
    return { ok: false };
  }

  let source = "direct";
  if (typeof data.source === "string" && SOURCE_RE.test(data.source)) {
    source = data.source;
  }

  // UTC day bucket (YYYY-MM-DD). Aggregate-only — one doc per event/source/day.
  const day = new Date().toISOString().slice(0, 10);
  const id = `${day}__${source}__${event}`;

  await db
    .collection("metrics")
    .doc(id)
    .set(
      {
        event,
        source,
        day,
        count: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return { ok: true };
});
