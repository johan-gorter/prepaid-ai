# Measurement — funnel & viral-loop metrics without a consent banner

Status: **plan, not yet implemented.** This document defines what we measure,
how we measure it without cookie consent, and which decisions are still open.
This must exist before unknown users are invited (see the tracking issue):
without these numbers, every marketing effort and every funnel change is blind,
and the viral loop in [viral-flow.md](viral-flow.md) cannot be tuned.

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

## Open decisions (PO to decide before implementation)

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
