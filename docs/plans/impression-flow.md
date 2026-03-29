# Impression Flow Redesign

## Overview

Redesign the renovation workflow to be impression-centric. Renovations no longer
have titles. The first AI result is auto-starred as the "after". A renovation
details page shows all impressions chronologically. The home page displays each
renovation as
a diagonal before/after composite.

---

## Data Model Changes

### Renovation (Firestore: `users/{uid}/renovations/{id}`)

```diff
  interface Renovation {
    id: string;
-   title: string;
    originalImagePath: string;
    originalImageUrl?: string;
+   afterImpressionId?: string;   // ID of the starred "after" impression
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }
```

- `title` removed everywhere (type, composable, creation, display).
- `afterImpressionId` points to the impression whose `resultImagePath` is
  used as the "after" image on the home page and as the default source for
  "Next Change".
- When the starred impression is deleted, auto-star the most recent completed
  impression. If none remain, clear to `undefined`.

### Impression — no structural changes

The existing `Impression` interface stays as-is. The star lives on the parent
Renovation document (`afterImpressionId`), not on the impression itself.

---

## Routes

| Path                  | Name                | View                       | Change                                                        |
| --------------------- | ------------------- | -------------------------- | ------------------------------------------------------------- |
| `/`                   | `home`              | `HomePage.vue`             | **Modify** — diagonal before/after cards, no title            |
| `/login`              | `login`             | `LoginPage.vue`            | No change                                                     |
| `/renovation/new`     | `new-renovation`    | `NewRenovationPage.vue`    | **Modify** — remove title, show 3-button bar after completion |
| `/renovation/:id`     | `renovation-detail` | `RenovationDetailPage.vue` | **Rewrite** — becomes Renovation Details page                 |
| `/renovation/:id/new` | `new-impression`    | `NewImpressionPage.vue`    | **New** — mask+prompt flow on existing source image           |

---

## Page Specifications

### Page 1: Home Page (`/`)

**What changes:**

- Renovation cards no longer show a title or date text below the image.
- Each card is a single square thumbnail showing a **diagonal before/after
  composite**.
- Tapping a card navigates to `/renovation/:id` (renovation details).

**Diagonal before/after composite (rendered client-side on a `<canvas>`):**

- The card is a square image.
- A diagonal line at **15 degrees** from horizontal divides the image.
- **Top-left region (30%):** the "before" image (`originalImagePath`).
- **Bottom-right region (70%):** the "after" image (`resultImagePath` of the
  starred impression).
- A **black line** (2-3px) sits on the diagonal separating the two regions.
- If no impression is starred yet, the entire card shows the before image.
- Both images are drawn full-bleed (cover the entire square), then clipped to
  their respective triangle/polygon region.

**Data needed per card:**

- `renovation.originalImagePath` (before)
- `renovation.afterImpressionId` → fetch that impression's `resultImagePath`
  (after)

**Implementation approach:**

- Resolve both URLs via `useStorageUrl`.
- Draw the composite on an offscreen canvas and set as `<img src>` via
  `canvas.toDataURL()`, or use a visible `<canvas>` element per card.
- The 15-degree line means the split is not a straight diagonal corner-to-corner.
  Use `ctx.beginPath()` + `clip()` with a polygon computed from the 15-degree
  angle.

### Page 2: New Renovation Page (`/renovation/new`)

**What changes from current:**

- **Step 1 (Capture):** Title input removed. Only photo selection remains.
  `canGoNext` for step 1 changes to just `!!loadedImage.value`.
- **Steps 2-3 (Mask, Prompt):** Unchanged.
- **Step 4 (Processing):** Unchanged (spinner while uploading).
- **Step 5 (Result — NEW):** After the impression is created and the page would
  normally redirect, instead stay on this page and show a new "result" step.
  This step displays:
  - The result image (once the impression completes processing), or a spinner
    while pending/processing.
  - **Three buttons** in a bottom bar:
    - **Renovation Details** — navigates to `/renovation/:id`
    - **Trash** — deletes the just-created impression, resets to step 2
      (mask drawing) with the same source image still loaded. The renovation
      document remains. If this was the starred impression, auto-star the most
      recent completed impression (or clear if none).
    - **Next Change** — navigates to `/renovation/:id/new?source=<impressionId>`
      using the just-created impression as the source.

**On creation:** The first impression is auto-starred. The composable's
`createImpression` (or the page itself) sets `afterImpressionId` on the
renovation document to the new impression's ID.

**Auto-star logic:** When creating an impression under a renovation that has no
`afterImpressionId` yet, automatically set it. This happens for the first
impression of every renovation.

### Page 3: Renovation Details Page (`/renovation/:id`) — rewrite of RenovationDetailPage

**Purpose:** Scrollable timeline of all impressions for a renovation.

**Layout:**

- **Header:** Back button (goes to `/`), "Renovation Details" heading, and a
  trash button (top-right) to delete the entire renovation (with confirmation).
- **Scrollable list** (full height minus header):
  - Ordered **ascending by `createdAt`** (oldest at top, newest at bottom).
  - **First item** (pinned): The original "before" image
    (`renovation.originalImagePath`). This is tappable — navigates to
    `/renovation/:id/new?source=before` to start a new impression from the
    original.
  - **Each impression item** shows:
    - The result image (full width) if completed, or a status indicator
      (spinner for processing, error for failed, clock for pending).
    - The prompt text below the image (small, secondary text).
    - A **star toggle** button (top-right corner overlay on the image).
      Filled star = this is the current "after". Tap to set this impression as
      the after. Only completed impressions can be starred.
    - There is a trash button on top left to delete the impression. If starred, auto-star the most recent completed impression after deletion.
    - Tapping the image (not the star) navigates to
      `/renovation/:id/new?source=<impressionId>` to create a new impression
      from this result.
  - On initial load, the list **scrolls to the starred/after impression** so
    it is centered in the viewport. If no impression is starred, scrolls to
    the bottom.

### Page 4: New Impression Page (`/renovation/:id/new`) — NEW

**Purpose:** Create a follow-up impression from any existing image in the
renovation details.

**Route params/query:**

- `:id` — renovation ID
- `?source=before` — use the original image as source
- `?source=<impressionId>` — use that impression's `resultImagePath` as source

**Flow:**

The source image is loaded automatically (not a numbered step). Then:

1. **Step 1: Mark Area** — same canvas-based mask drawing as NewRenovationPage
   step 2. The source image is already square-fitted (all stored images are
   1000x1000).
2. **Step 2: Describe Change** — same prompt textarea.
3. **Step 3: Processing** — upload composite, create impression document.
4. **Step 4: Result** — same 3-button bar as NewRenovationPage step 5:
   - **Renovation Details** — navigate to `/renovation/:id`
   - **Trash** — delete the just-created impression, reset to step 1 with
     the same source image.
   - **Next Change** — navigate to `/renovation/:id/new?source=<newImpressionId>`

**Source image handling:**

- When `source=before`: fetch `renovation.originalImagePath` from the renovation
  document.
- When `source=<impressionId>`: fetch that impression's `resultImagePath`.
- Since the source is already a 1000x1000 PNG, skip the square-fitting step.
  Load it directly onto the canvas.

**Star logic:** If the renovation has no `afterImpressionId` (e.g., all previous
impressions were trashed), auto-star this new impression on creation. Otherwise,
do not change the star — the user manually stars from the renovation details page.

---

## Composable Changes

### `useRenovations.ts`

- `createRenovation(data)` — remove `title` from the input. Only takes
  `{ originalImagePath: string }`.
- `createImpression(renovationId, data)` — after creating the impression doc,
  check if the renovation's `afterImpressionId` is unset. If so, set it to the
  new impression ID (optimistic first-impression starring).
- **New: `setAfterImpression(renovationId, impressionId)`** — updates
  `afterImpressionId` on the renovation document. Used by the star toggle on the
  renovation details page.
- **New: `deleteImpression(renovationId, impressionId)`** — deletes an
  impression document and its Storage files (composite, result). If the deleted
  impression was the starred one, find the most recent completed impression and
  star it, or clear `afterImpressionId`.
- **New: `deleteRenovation(renovationId)`** — deletes the renovation document,
  all its impressions subcollection documents, and all associated Storage files
  (originals, composites, results). Used by the trash button on the renovation
  details page header.

### `useImpressions.ts`

- Change sort order from `desc` to **`asc`** (ascending by `createdAt`) to
  match the renovation details display order.

### No new composables needed

The existing `useStorageUrl` and `useAuth` remain unchanged.

---

## Cloud Function Changes

### `processImpression`

- **Auto-star on first completion:** After setting `status: "completed"` and
  `resultImagePath`, read the parent renovation document. If
  `afterImpressionId` is equal to this impression's ID (set optimistically at
  creation), leave it. This confirms the optimistic star. No extra logic needed
  since the client already set it at creation time.
- No other changes required. The function processes images identically
  regardless of whether the source was an original or a previous impression's
  result.

---

## Shared UI: Three-Button Bottom Bar

Used in two places: NewRenovationPage (step 5) and NewImpressionPage (step 4).

```
┌─────────────────────┬─────────────┬─────────────┐
│ Renovation Details  │    Trash    │ Next Change  │
└─────────────────────┴─────────────┴─────────────┘
```

**Styling:** Fixed to bottom, equal-width buttons, same `#0f3460` / `#1a1a2e`
color scheme as the rest of the app.

**Behavior per context:**

| Context                    | Renovation Details      | Trash                              | Next Change                             |
| -------------------------- | ----------------------- | ---------------------------------- | --------------------------------------- |
| NewRenovationPage (step 5) | Go to `/renovation/:id` | Delete impression, reset to step 2 | Go to `/renovation/:id/new?source=<id>` |
| NewImpressionPage (step 4) | Go to `/renovation/:id` | Delete impression, reset to step 1 | Go to `/renovation/:id/new?source=<id>` |

---

## Diagonal Composite Rendering (Home Page Cards)

Geometry for the 15-degree diagonal split on a square canvas of size `S`:

```
      15deg from horizontal
     ╱
    ╱  "After" region (70% of area)
   ╱
  ╱─────── black line (2-3px)
 ╱
╱  "Before" region (30% of area)
```

**Implementation:**

1. Compute the dividing line. A 15-degree line from horizontal, positioned so
   that the "before" triangle/polygon is 30% of the total area.
2. For a square of side `S`, a line at angle `theta = 15deg` that gives 30%
   area above-left:
   - The line passes through a computed y-intercept such that the clipped polygon
     has area `0.3 * S * S`.
3. Draw "before" image clipped to the upper-left polygon.
4. Draw "after" image clipped to the lower-right polygon.
5. Draw the black dividing line (2-3px stroke along the same path).

This can be a reusable function: `drawBeforeAfterComposite(canvas, beforeImg,
afterImg, size)`.

---

## File Change Summary

| File                                 | Action                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `src/types.ts`                       | Remove `title` from `Renovation`, add `afterImpressionId?`                                 |
| `src/router/index.ts`                | Add `/renovation/:id/new` route                                                            |
| `src/views/HomePage.vue`             | Rewrite cards as diagonal before/after composites, remove title display                    |
| `src/views/NewRenovationPage.vue`    | Remove title input, add step 4 with result + 3-button bar, auto-star logic                 |
| `src/views/RenovationDetailPage.vue` | Full rewrite as Renovation Details page                                                     |
| `src/views/NewImpressionPage.vue`    | **New file** — mask+prompt flow on existing source image                                   |
| `src/composables/useRenovations.ts`  | Remove title from create, add `setAfterImpression`, `deleteImpression`, `deleteRenovation` |
| `src/composables/useImpressions.ts`  | Change sort order to ascending                                                             |
| `functions/src/index.ts`             | No changes needed                                                                          |
| `e2e/specs/*.spec.ts`                | Update tests for removed title, new routes, new flows                                      |
| `ct/*.ct.ts`                         | Update component tests                                                                     |

---

## Implementation Order

1. **Data model** — Update `types.ts` and `useRenovations.ts` (remove title, add
   `afterImpressionId`, add new methods).
2. **useImpressions.ts** — Flip sort order to ascending.
3. **NewRenovationPage.vue** — Remove title, add step 5 with 3-button bar and
   auto-star.
4. **NewImpressionPage.vue** — New file, extract shared mask/prompt logic from
   NewRenovationPage.
5. **RenovationDetailPage.vue** — Full rewrite as Renovation Details page.
6. **HomePage.vue** — Diagonal before/after composite cards.
7. **Router** — Add new route.
8. **Tests** — Update E2E and component tests.

Steps 1-2 are foundational. Steps 3-4 share mask/prompt UI logic and should be
done together to avoid duplication. Step 5 depends on the composable methods
from step 1. Step 6 can be done independently once the data model is in place.

---
