# Measurement — funnel & viral-loop metrics without a consent banner

Status: **implemented** (issue #93, first cut). This document defines what we
measure, how we measure it without cookie consent, and records the decisions
behind the implementation. This must exist before unknown users are invited
(see the tracking issue): without these numbers, every marketing effort and
every funnel change is blind, and the viral loop in
[viral-flow.md](viral-flow.md) cannot be tuned.

## Where it lives in the code

- `src/composables/useTrack.ts` — the `track(event)` client beacon, the fixed
  `TRACK_EVENTS` enum, and the in-memory URL source attribution
  (`setTrackSource`).
- `src/router/index.ts` — captures the first-touch source from `?src=` (or a
  `/share/:token` link → `share`) on every navigation.
- `functions/src/trackEvent.ts` — the `onCall` counter endpoint. Validates the
  enum + source and atomically increments one `metrics/{day}__{source}__{event}`
  doc (`{ event, source, day, count, updatedAt }`). Stores **no uid, IP, or
  user agent**.
- `firestore.rules` — the `metrics` collection is locked to clients (`read,
  write: if false`); only the Cloud Function's Admin SDK writes it.
- Funnel call sites: `MainPage.vue` (landing_view, cta_click),
  `NewImpressionPage.vue` (photo_chosen, mask_done, action_chosen, next_edit,
  impression_trashed, share_visit), `useGenerateImpression.ts` (generate_click,
  result_view, generate_fail), `useCheckout.ts` (paywall_view, amount_chosen,
  payment_done), `LoginPage.vue` (login_done), `PreviewStep.vue` (share_created).

To read the counters: the Firebase console on the `metrics` collection, or query
docs where `day == "YYYY-MM-DD"`. Each doc id is `${day}__${source}__${event}`.

## Principles

1. **No consent banner for the core metrics.** The app currently needs no
   cookie banner (only functional storage) and "your data stays private" is
   part of the brand. Core measurement must preserve that: no third-party
   trackers, no cross-site identifiers, no persistent device IDs, aggregated
   storage only.
2. **Consent, if ever needed, comes late and explicit.** If we later want
   user-level journeys or cohorts that require a persistent identifier, we ask
   for it as an **opt-in at account creation or in account settings** ("help
   ons de app te verbeteren"), never as a cookie wall on the landing page.
   A share-link recipient must never see a consent dialog before the wow.
3. **Measure steps, not people.** The funnel questions ("where do people drop
   off?") are answerable with anonymous counters per step per day. That is the
   default; anything more identifying needs a documented reason.
4. **Cheap and boring.** No analytics platform until the numbers prove we need
   one. Counters in our own backend are free, private, and sufficient at this
   scale.

## What we measure

### Funnel steps (anonymous counters, per day, per source)

```
landing_view → cta_click → photo_chosen → mask_done → action_chosen
  → generate_click → paywall_view → amount_chosen → login_done
  → payment_done → result_view → next_edit → share_created
```

Each step is one event. The two ratios we care most about:

- **Paywall drop:** `paywall_view → payment_done`. This number decides the
  future of the parked "personal invites / free credits" idea.
- **Wow-to-share:** `result_view → share_created`. This is the start of the
  viral loop.

### Viral loop (K-factor decomposition)

- `share_created` per paying user (how many links does a happy user make?)
- `share_visit` (landing on a share URL) per created share
- `share_visit → photo_chosen` (recipient starts their own make-over)

K ≈ product of these three. Source attribution comes from the URL itself
(share token / future invite code) — data the visitor carries with them, no
device storage needed.

### Quality & health proxies

- `generate_fail` (AI/server errors) — a failed first edit kills the loop
- `impression_trashed` shortly after generation (dissatisfaction proxy until
  the satisfaction meter exists)
- Edits per session distribution (is the power loop used?)
- Cold-load performance of the share landing page (see open decision 7)

## How — implementation sketch

- **Client:** a tiny `track(event, source?)` composable that fires
  fire-and-forget beacons (`navigator.sendBeacon` or a queued fetch) to our own
  endpoint. Events are a **fixed enum** — no free text, no URLs, no screen
  sizes, nothing that can smuggle PII in.
- **Server:** a Cloud Function that validates the enum and increments a
  Firestore aggregate doc per `{event, source, day}` (sharded counters only if
  volume ever demands it). **Do not store IP addresses or user agents**; set
  function log retention accordingly.
- **Offline/PWA:** events may be dropped when offline — accept the loss,
  counters are for trends, not bookkeeping.
- **Signed-in actions** (payments, credits spent) are already first-party data
  in Firestore under the account; revenue/retention reporting can derive from
  those directly without new tracking.
- **Dashboard:** none at first — a small read script or the Firebase console
  on the aggregate docs is enough until the numbers are looked at weekly.

## Legal notes

- ePrivacy applies to *storing or reading identifiers on the device*, not to
  counting requests server-side. Anonymous step counters with no device
  storage and no fingerprinting need no consent.
- The privacy policy (issue #81) must still *describe* this measurement
  (what is counted, that it is anonymous and aggregated).
- Session stitching choices below move along this line: in-memory = clearly
  fine, sessionStorage = grey zone, persistent ID = consent territory.

## Decisions (resolved for the issue #93 implementation)

The eight open decisions below were resolved as the documented default
recommendations; the implementation follows them. Revisit any of these when the
numbers justify the extra cost.

1. **Tooling:** own Firestore counters via the `trackEvent` Cloud Function.
2. **Session stitching:** none beyond pure per-step counters. Aggregate
   `{event, source, day}` counts need no session id, so none is stored — the
   cleanest, most clearly consent-free option. Upgrade to an opt-in cohort id
   later if funnel-stitching questions demand it.
3. **Consent trigger:** the line is *"any identifier that survives the browser
   session or links events across visits."* Nothing in this implementation
   crosses it — the source label is in-memory only and lost on reload.
4. **Signed-in attribution:** **no** uid on events. Events stay anonymous;
   revenue/retention reporting derives from first-party account data in
   Firestore (balances, transactions), not from the counters.
5. **Source attribution convention:** a single `?src=` URL param, separate from
   the wizard's internal `?source=` routing. Allowed values: `share` (also
   implied by a `/share/:token` link) and `inv-<code>` (`[a-z0-9]{1,32}`, for
   future invite/influencer codes). Everything else is bucketed as `direct`.
   First-touch wins and is held in memory for the visit.
6. **Retention:** daily aggregates kept indefinitely (anonymous). No raw event
   log exists — the function only increments counters.
7. **Web-vitals beacon:** **no.** Counters stay pure counts; no numeric values.
8. **Opt-in placement:** deferred. No opt-in is built yet; if user-level
   cohorts are ever wanted it lives at account creation (never a cookie wall).

## Open decisions (original PO list, now resolved above)

1. **Tooling:** own Firestore counters via a Cloud Function (default per this
   doc) vs self-hosted Plausible-style tool vs paid EU-hosted SaaS. Default
   recommendation: own counters; revisit when weekly analysis costs more time
   than a tool would.
2. **Session stitching:** (a) none — pure per-step counters (cleanest, can
   miscount funnels when steps span reloads); (b) in-memory session ID — lost
   on reload, no storage, consent-free; (c) `sessionStorage` ID — survives
   reload within the tab, ePrivacy grey zone; (d) only under opt-in consent.
   Default recommendation: (b), upgrade to (d) later if cohort questions
   demand it.
3. **Consent trigger definition:** write down the exact line that, when
   crossed, requires the opt-in (proposal: "any identifier that survives the
   browser session or links events across visits").
4. **Signed-in attribution:** attach `uid` to events after login for
   retention/cohort analysis (legitimate-interest basis, documented in the
   privacy policy) — yes/no, and if yes, from which step.
5. **Source attribution convention:** URL parameter scheme for share tokens
   and future invite/influencer codes (e.g. `?src=share` / `?src=inv-<code>`),
   and which values are allowed in the counters.
6. **Retention:** how long to keep daily aggregates (proposal: indefinitely —
   they are anonymous) and whether any raw event log exists at all (proposal:
   no raw log).
7. **Web-vitals beacon:** measure cold-load times of the share landing page
   via the same endpoint — yes/no (adds a numeric value to otherwise pure
   counters).
8. **Consent-after-N-steps variant:** the PO floated asking consent only
   deeper in the funnel. Decide whether the opt-in lives at account creation
   (default recommendation), in settings, or as a post-payment prompt.
