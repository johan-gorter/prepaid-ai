# The Viral Flow — design decisions and invariants

This document records the product reasoning behind the renovation ("make-over")
funnel, from landing page to share link. **Future agents: treat the decisions
below as deliberate.** They were made by the product owner walking the full flow
(June 2026); do not "fix" them in passing. If a change would violate one of the
invariants, raise it as a question instead of a refactor.

Related issues: #83 (first-time empty state), #85 (mask page), #86
(choose-action page), #88 (buy-credits page), #89 (login page), #91 (result
footer), #92 (share OG previews). Where this document and an open issue
disagree, the issue is newer.

## The loop

```
landing page → take/upload photo → mask (~10 s) → choose action (price reveal)
   → generate → [buy credits → login → Stripe → resume] → result
   → immediately mask again (power loop)  and/or  → share link
share recipient → opens link on the platform → starts their own make-over → …
```

The product mission this serves: a great AI tool for people who do not want or
cannot afford a monthly subscription. The renovation flow is the eye-catcher
that should be able to go viral. Margins stay low; no financial risk is taken.

## Invariants and the reasoning behind them

### 1. Deferred auth — login at the latest possible moment

A visitor gets all the way through photo → mask → action choice → colour/prompt
**without an account**. Login is only required when payment becomes necessary,
and the pending work is never lost: drafts (source image, mask, prompt) live in
IndexedDB, and the pending-purchase intent (`usePendingPurchase.ts`) survives
the login + Stripe round-trip and resumes the original action.

*Why:* the first-time visitor must reach the point of maximum motivation before
being asked for anything. Every step they invest makes the account step
cheaper. **Never add a login wall earlier in the flow.**

### 2. The mask is deliberately primitive

~10 seconds of finger-painting. No zoom, no brush size, no precision tools
(#85 keeps it that way explicitly). Sloppy masks are fine — the AI resolves
imprecision.

*Why:* the mask is a commitment device as much as an input. It must stay fast
enough that nobody abandons, and imprecise enough that nobody feels they need
skill. Adding precision tools would signal that precision matters. It doesn't.

### 3. Price is revealed *after* the mask, never before

The choose-action page (#86) is the deliberate price-reveal moment: remove = 5
credits, colour change = 10, free edit = 10, with the anchor "1 credit =
$0.01". Earlier pages (landing, first-renovation, photo, mask) do not show
operation prices.

*Why:* after ~10 seconds of masking, a 5–10 cent price is a relief, not a
barrier. Before any investment it is just a number that invites comparison
shopping. (Marketing copy elsewhere may say "from $0.05 per edit"; the *flow*
reveals price only here.)

### 4. No free credits (this phase)

The paywall before the first generated result is accepted for now. Free starter
credits were considered and rejected: abuse via throwaway accounts is an
unbounded cost. The earmarked future alternative is **personal invites**
(bounded, relationship-backed). Do not add free credits, trials, or "first one
on us" without an explicit PO decision.

### 5. Buy-credits page is generic and honest

The page serves every paid feature, including chat (hence `min`/`max` params —
chat response length is unknown upfront). Copy must stay action-agnostic
("≈ 7 acties", not "≈ 7 kleuraanpassingen"). The 75-credit minimum is explained
honestly (Stripe transaction costs). Credits never expire — say so; it is the
strongest reassurance we have. (#88)

### 6. The result page is also the next editing page

The result reuses the masking canvas: the user can paint the next mask directly
on the result. The "Next Change" footer button is **deliberately redundant** —
power users go straight to painting, but not every user understands that, so
the explicit button stays. Do not remove either path. The page does not teach
the shortcut with helper text (considered, rejected: keep the page quiet).

*Why:* chained small edits are both the best AI strategy ("werk in kleine
stappen") and the revenue model (every step is a paid action). The friction
between result n and edit n+1 must stay near zero.

### 7. Sharing is link-only, the picture lives behind the link

The share is a URL (plus one sober text line). No image file is attached to the
share payload. Rich previews come from per-share OG tags served on the link
itself (#92) — the card draws the click, the click lands on the platform, and
the recipient can immediately start their own make-over.

*Why:* an attached image satisfies the recipient inside the chat app; a link
brings them to us. The OG card is the lure, not the product.

### 8. Tone: nuchter

Copy is sober and concrete, never hype ("Gemaakt met AI op payasyougo.app").
Concrete recognisable examples instead of abstract verbs. No assumptions about
what is in the photo (it may not be a room). No American-style marketing
superlatives. AI fallibility is admitted openly and coupled to the remedy:
*"AI kan soms fouten maken — werk in kleine stappen voor het beste resultaat."*

### 9. UI conventions inside the flow

- Photos are always square; show them edge-to-edge on phones.
- Footer: "next" action far right, "previous"/back far left, destructive
  actions never adjacent to the primary action (#91).
- Everything NL + EN via vue-i18n; nothing may truncate or wrap at 320–412 px.

### 10. Pricing facts (single source of truth for copy)

| Fact                | Value                                  |
| ------------------- | -------------------------------------- |
| 1 credit            | $0.01                                  |
| Remove              | 5 credits                              |
| Colour change       | 10 credits                             |
| Free-prompt edit    | 10 credits                             |
| Minimum top-up      | 75 credits (Stripe transaction costs)  |
| Credit expiry       | never                                  |
| Right of withdrawal | waived via express consent at purchase |

## E2E test blueprint

The flow deserves one end-to-end spec that walks the whole loop and asserts the
invariants, so regressions in *any* step surface as a broken loop, not as an
isolated page bug. Assertions, in order:

1. Landing page (signed out): renovation card visible, CTA navigates into the
   flow **without** login redirect.
2. Photo via the upload path (`setInputFiles` on the existing hidden input) →
   crop → mask stage reachable, still signed out.
3. Mask stage: paint a stroke, "Volgende" enabled; **no price text anywhere**
   on photo/crop/mask stages.
4. Choose-action stage: all options show their credit price; the $0.01 anchor
   is present.
5. Pick colour change → paint stage → Generate while signed out with 0 credits
   → redirected to `/buy-credits` with correct `min`/`max` and a `redirect`
   param pointing back to the impression flow.
6. Buy-credits → choose amount → redirected to login; after sign-in (emulator
   user) the purchase intent resumes (assert the resume, not just the URL).
7. After (emulated) payment: back at the impression flow automatically; the
   draft photo and mask survived the whole round-trip.
8. Result stage: canvas accepts a new mask stroke immediately (power loop) and
   the "Next Change" button also exists.
9. Share: produces a share URL; the share token resolves for an anonymous
   visitor (new context, signed out) and that visitor can start their own
   renovation from there without a login wall.

Steps 1–5 need no Cloud Function and should be cheap; 6–9 depend on emulator
auth/functions and may be a second spec. A failing step number maps directly
to the numbered invariants above.

## Explicitly parked (do not build without PO)

- Free starter credits (revisit as personal invites).
- Web Share Target (receiving photos shared from the OS gallery).
- Remix loop on the share landing page ("edit this photo yourself").
- Satisfaction meter on results, before/after compare, richer share images.
- Zoom/brush tools on the mask (rejected, not parked — see invariant 2).
