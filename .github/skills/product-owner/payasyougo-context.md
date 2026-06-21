# payasyougo.app — Product Owner Context

The app-specific facts the [product-owner](SKILL.md) reasons against. These are the
"one-off subjects": the mission, the audience, the money model, the decisions already
made, and the standing backlog. Generic product-owner method lives in SKILL.md; this is
the substrate it operates on.

Several decisions below are canonically recorded elsewhere — when a section points to a
`docs/` file, **that file is the source of truth**; this is a map, not a copy.

## Mission (verbatim from the product owner)

> Become a great tool for people who do not want or cannot afford a monthly subscription
> on an AI service. The renovations part should be an eye-catcher and be able to go viral.
> We do not need to make money in the short term, and we do not want to take any financial
> risks. In the long term it would be nice to generate revenue. Keep margins low in order
> not to have our ideas stolen by competitors.

Operational reading:

- **Audience:** subscription-averse, cost-conscious people who want AI without a monthly
  commitment. Low threshold for *everyone* — renovations, klussen, verbouwingen,
  herinrichtingen.
- **Renovations ("make-overs") = the viral eye-catcher.** The shared artifact is the hook;
  the landing page is where the loop ends, not where it starts.
- **No financial risk.** Any feature that could cost money at scale (free credits, anonymous
  AI actions) is judged on abuse exposure first. Bounded risk only.
- **It's an eenmanszaak (sole proprietorship), not a BV.** A strong "indie" feel is fine; the
  basics must be solid. One BV/insurance angle is out — not at this stage.

## The viral flow — invariants

**Source of truth: [docs/viral-flow.md](../../../docs/viral-flow.md).** `AGENTS.md` requires
reading it before changing anything in the funnel. Do not "fix" these in passing:

- **Deferred auth** — photo → mask → choose all run with no login wall; login comes only at
  the paywall ("to keep your credits you need an account").
- **The mask is a deliberately primitive ~10-second job** — sloppy is fine, the AI resolves
  imprecision. It doubles as a commitment device (people who invested 10s don't bail at 5–10¢).
  No zoom, no brush size.
- **Square photo, edge-to-edge** — square is a deliberate choice; only the side gutters are
  waste to reclaim.
- **Price is revealed *after* the mask**, on the choose-action screen, with an anchor
  ("1 credit = $0.01"). Not earlier in the flow; broad "from 5¢ per edit" messaging belongs in
  marketing copy on the landing page.
- **Power loop** — the result page is reused so the user can immediately mask the next area and
  keep going; "Next change" is deliberately redundant for users who don't realize that.
- **Link-only sharing** — share a link, no preview image *attached*; the OG card lives *behind*
  the link so the recipient still clicks through to the platform and does their own follow-up edit.
- **Sober, non-American tone.** "Gemaakt met AI op payasyougo.app" — no hype, no assumptions
  about what's in the photo.
- **No free starter credits in this phase** (abuse via throwaway accounts). Maybe later via
  personal invite codes with bounded credit.

## Pricing / credits

- **1 credit = $0.01.**
- **Remove = 5 credits; paint (colour) and free edit = 10 credits.** (Watch for stale 5-credit
  pricing in the colour flow — both client and `functions/src/`. nano-banana-2 pricing is still
  being finalized; see the project memory.)
- **Minimum top-up 75 credits** via Stripe (transaction-cost floor — reframe as value:
  "≈ 7 actions", kept action-agnostic because the buy-credits page is shared with private-chat,
  which sends a `min`/`max` range).
- **Credits never expire** (simplest, most trust-building, sidesteps Dutch voucher rules).
- Buy-credits copy is **generic** (renovations *and* chat), driven by `min`/`max`.

## Legal basics (issue #81)

No cookie banner needed (only functional storage: auth + IndexedDB). Must-haves before serious
users: privacy policy (AVG), colofon/footer with KvK + the separate btw-id (safe to publish),
**withdrawal-right waiver checkbox** in the buy-credits flow (user chose waiver over 14-day
refund), reword "100% private" → "not used to train AI, not seen by humans", a "not legal
advice / AI can make mistakes" disclaimer, and completed Usage Terms (credits never expire,
refund policy, liability, acceptable use). **Min age: 13+, under-16 with parental consent**
(NL-conform). All copy NL + EN via i18n. PO is not a lawyer — a one-off AVG review is worth it
once real users arrive.

## Measurement (issue #93)

**Source of truth: [docs/measurement.md](../../../docs/measurement.md).** Privacy-friendly funnel
+ viral-loop metrics with **no consent banner** (count steps, not people; own Cloud Function
counters per `{event, source, day}`; no IP/user-agent stored). This is the **gate before
inviting unknown users** — without the numbers, every marketing spend is blind. Has eight open
decisions for the PO. Wired to #81 (describe measurement in the privacy policy) and to the
viral-flow E2E blueprint.

## UI conventions decided

- **Footer rule (app-wide): "next/forward" always far right, "previous/back" always far left.**
  The middle holds actions, never the destructive one next to the primary.
- **Breadcrumbs removed everywhere** — the page title moves into the page; the small logo only
  when the large one doesn't fit.
- **"Overzicht" / "Overview"** = go to the list of all impressions of a renovation (was
  "Renovation Details", which truncated).
- Bilingual **NL + EN**, always both.
- Light/dark mode already exists (preference in IndexedDB) — hygiene, not a growth lever; new
  screens must respect it (hex-contrast on the colour picker deliberately ignores the theme).

## The backlog from the first walk-through (issues #80–#93)

GitHub issues are the backlog (`gh issue list`). The product-owner session produced:

- **#80** Feedback form: dead submit button when signed out → redirect to login, preserve draft.
- **#81** Legal basics (above).
- **#82** Chat card: concrete examples, benefit-led copy, fix globe icon.
- **#83** Renovations page: first-time empty state at `/first-renovation`.
- **#84** Remove app-bar breadcrumbs; title into the page.
- **#85** Mask page: instruction-overlap bug, edge-to-edge photo, undo in footer.
- **#86** Choose-action page: show masked photo, price on every option, guidance note.
- **#87** Paint page: grouped named swatches, slider-based HSL picker, synced tabs.
- **#88** Buy-credits page redesign: context, single choice list, trust lines, sticky CTA.
- **#89** Login page: account-reassurance line, "Continue with" wording, generic subtitle,
  terms/privacy links.
- **#90** Result page: fullscreen viewer with pinch-zoom.
- **#91** Result page footer: prev-left/next-right convention, rename to "Overview", move Trash.
- **#92** Share links: OG preview tags via Cloud Function + native share sheet (`navigator.share`).
- **#93** Privacy-friendly funnel & viral-loop measurement (prerequisite for inviting users).

## Parked ideas (do not build without PO sign-off)

Satisfaction meter (5 smileys, stored on the impression, targeted follow-ups on the two lowest,
**no** automatic free retry — financial risk); before/after compare (press-and-hold shows the
original); enriching the shared image with a subtle "payasyougo.app" mark; Web Share Target
(share a photo *into* the app); email-link (magic-link) login; Apple login (deferred until the
~$99/yr developer account is justified); more languages (**German next** — neighbour, klus
culture, RAL is a German standard — *language ≠ market*: each one also means support + translated
legal); influencer experiments only via bounded, attributable personal invite codes.
