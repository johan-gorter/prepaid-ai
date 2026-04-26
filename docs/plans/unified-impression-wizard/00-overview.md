# Unified Impression Wizard — Overview

## Status: Proposed

## Goal

Replace the two existing wizards (`NewRenovationPage` and `NewImpressionPage`)
with a single unified wizard at `/new-impression`. Move image acquisition
(camera, upload+crop, paste+crop) into dedicated pages that hand off to the
unified wizard via IndexedDB. The wizard is refresh-safe: on reload, it reads
the source image from IndexedDB and resumes at the first stage.

## Top-level user flows (after change)

```
                                 ┌──────────────────────────────┐
                                 │  /renovations  (list page)   │
                                 └──────────────────────────────┘
                                  │ Take Photo │ Upload │ Paste │
                                  ▼            ▼        ▼
                       ┌─────────────────┐  ┌────────────────┐
                       │ /photo (canvas) │  │ /crop          │
                       │ (live camera)   │  │ (uncroppedImpr │
                       └─────────┬───────┘  │  essionSource) │
                                 │          └───────┬────────┘
                                 │                  │
              IDB[impressionSource] = blob          │
                                 ▼                  ▼
                       ┌────────────────────────────────────────┐
                       │ /new-impression?source=photo|crop      │
                       │   (mask stage first)                   │
                       └──────────────────┬─────────────────────┘
                                          │
                  ┌───────────────────────┼─────────────────────────────┐
                  │                       │                             │
                  ▼                       ▼                             ▼
              MASK stage           PROMPT stage                PROCESSING stage
        (draw on overlay)    (textarea on top half)          (cloud function runs)
                                                             on completion:
                                                             IDB[impressionSource]=result blob
                                                             redirect ?source=impression&...
                                                             stage = preview

  /renovation/:id  (timeline)
   ├── click Original   → /new-impression?source=original&renovation=:id
   └── click Result     → /new-impression?source=impression&renovation=:id&impression=:i
                          (preview stage first)
```

In the preview stage the wizard shows the same maskable image and three
controls: `back`, `trash`, `next change`. Starting to paint OR pressing
`next change` transitions to the mask stage in-place (no navigation).

## File plan

```
src/
  composables/
    useImpressionStore.ts          NEW — wraps IndexedDB image handoff
    useImpressionWizard.ts         NEW — stage/state machine for the wizard
  views/
    PhotoCapturePage.vue           NEW (copied from old/CameraCapturePage.vue)
    CropImagePage.vue              NEW (copied from old/CropImagePage.vue, re-targeted)
    NewImpressionPage.vue          NEW (the unified wizard)
    renovation/
      RenovationsPage.vue          MODIFIED (NewRenovationCard uses IDB + new routes)
      RenovationDetailPage.vue     MODIFIED (links to /new-impression)
      old/                         DELETE (after cutover)
  components/
    NewRenovationCard.vue          MODIFIED (writes IDB, navigates to new routes)
    MaskingCanvas.vue              UNCHANGED (re-used as-is)
    StickyFooter.vue               UNCHANGED
  router/
    index.ts                       MODIFIED (new routes; remove old routes)
docs/plans/unified-impression-wizard/   NEW — these planning docs
e2e/
  helpers/renovation.ts            MODIFIED (new URLs, IDB seeding helpers)
  specs/renovations/*.spec.ts      MODIFIED (URL/selectors)
ct/new-renovation.ct.ts            DELETE (target component is gone)
```

## Decisions baked in (confirm or override)

These are the foundational choices used in the rest of the plan. Override
any before implementation begins.

| # | Decision | Default | Rationale |
|---|---|---|---|
| 1 | IndexedDB access | Thin in-house wrapper around the native `indexedDB` API, no new dependency | Tiny surface area; existing code already does direct platform APIs |
| 2 | Stored value type | `Blob` (image/webp), 1024×1024 | Matches what we upload to Storage; smaller than data URLs; survives refresh |
| 3 | Routing shape | Flat: `/photo`, `/crop`, `/new-impression`. Renovation/impression IDs travel in the **query string** | Matches your wording; lets photo/crop reuse the same wizard before any renovation exists |
| 4 | `?source` values | `photo`, `crop`, `original`, `impression` (replaces old `before` / `<id>`) | Matches your plan; explicit per-source semantics |
| 5 | Required query params per source | `photo`, `crop`: none beyond `source`. `original`: `renovation`. `impression`: `renovation` & `impression` | Wizard can re-fetch the right Storage path on refresh |
| 6 | "Trash" semantics in preview stage | `source=impression` → delete that impression (existing behaviour). `source=original` → confirm-then-delete the whole renovation. `source=photo`/`crop` → discard IDB blob and return to `/renovations` | Mirrors current behaviour for impression; the only sensible action for original is to delete the renovation |
| 7 | After Generate | Wait for completion, write `resultImagePath` blob into `IDB[impressionSource]`, then `router.replace` to `/new-impression?source=impression&renovation=R&impression=I` (preview stage). Same code path as clicking the result on the timeline. | Unifies the result view; refresh stays correct; "Next Change" needs no special case |
| 8 | Result path while generating | Stay on `/new-impression` showing the **processing** stage. Source layout (header + same maskable image area, texts hidden) does not shift. | Keeps the layout invariant the plan calls for |
| 9 | Live camera page survival | Keep a dedicated `PhotoCapturePage.vue` (copied from `old/CameraCapturePage.vue`). The `data-testid="camera-input"` file-input bypass on `NewRenovationCard` is preserved (E2E uses it) but its handler now writes IDB + navigates to `/new-impression?source=photo`. | E2E tests rely on the file-input bypass; keeping it avoids needing a `getUserMedia` mock |
| 10 | Old code removal | Delete `src/views/renovation/old/` and routes in the same commit as the cutover. | The repo already lives on a feature branch; no two-shipping concerns |

## Open questions for you

1. **Decision 6, original→trash**: Is "delete the entire renovation" right, or
   should `trash` from `source=original` simply navigate back to the timeline
   (i.e. cancel)? **Default in plan: confirm-then-delete.**
2. **Decision 7 redirect target**: After Generate, the page redirects to
   `?source=impression`. Some users might prefer no URL change so that "Back"
   returns to the previous source. Confirm OK with the redirect.
3. **Decision 9, camera input**: E2E tests use `[data-testid="camera-input"]`
   `setInputFiles` to bypass `getUserMedia`. Should we keep that bypass on the
   renovations card (option A) or move it onto `PhotoCapturePage` itself
   (option B)? **Default: A.**
4. **Naming**: Path `/new-impression` (your wording) vs `/wizard` vs
   `/impression/new`. **Default: `/new-impression` per your plan.**

## Documents in this plan

- `00-overview.md` — this file
- `01-storage-and-routing.md` — IndexedDB schema, router changes, refresh contract
- `02-pages.md` — fine-grained per-page implementation
- `03-components-and-composables.md` — shared component / composable changes
- `04-tests.md` — E2E and CT updates, helper changes
- `05-migration-checklist.md` — what to copy from old, what to delete, order of work
