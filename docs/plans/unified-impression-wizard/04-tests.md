# Tests — E2E and CT updates

The renovation E2E suite (5 files, ~30 cases) and the single CT spec all
reference the old routes / titles / button bar. This document lists the
exact updates per file.

## Helper changes

### `e2e/helpers/renovation.ts` (MODIFIED)

`fillNewRenovationForm` (lines 37–69) currently:

1. Sets a file on `[data-testid="camera-input"]`,
2. waits for `URL = /renovation/new?source=camera`,
3. asserts `getByText("Paint the area you want to change")`,
4. draws a stroke,
5. clicks `Next`, fills `data-testid="prompt"`.

Update to:

1. Set the file on `[data-testid="camera-input"]` (same),
2. wait for `URL = /new-impression?source=photo`,
3. assert mask helper text — same selector,
4. (rest unchanged).

`createRenovationAndWaitForResult` (lines 78–96):

The post-Generate redirect now lands on
`/new-impression?source=impression&renovation=...&impression=...`. The
selectors `Renovation Details` button and `Result` alt-text move from a
"step 4" footer to the new preview-stage footer. Selectors stay the
same — only the URL the helper might assert differs. **Default change:
do not assert the URL in the helper** (current code does not).

`drawMaskStroke` (lines 101–114): unchanged.

### Optional new helper

Add `await seedImpressionSource(page, fileBytes)` that runs in-page JS to
write `IDB[impressionSource]`, for tests that want to bypass the file
input. Not required if all tests stay on the camera-input bypass. Provide
when adding new tests for the IDB refresh contract.

---

## `e2e/specs/renovations/new-renovation.spec.ts`

| Test | Change |
|------|--------|
| "shows mask step immediately after taking photo" | URL: `"/renovation/new?source=camera"` → `"/new-impression?source=photo"`. Title field assertion (line 31–32) stays. |
| "mask step shows Retake, Trash, and Next buttons" | URL change. **Retake** is still expected because `source=photo` (decision 9). |
| "Trash at mask step navigates to home" | URL change; behaviour unchanged (Trash on `mask` for `source=photo`/`crop` clears IDB and goes to `/renovations`). |
| "can navigate from mask to prompt step" | URL change. Selectors unchanged. |
| "clear mask button clears the drawn area" | URL change. |
| "back header button navigates to home" | URL change. Header back from `source=photo` goes to `/renovations` (decision in 01). |
| "Generate shows result step with three-button bar" | The result view is now the *preview stage* of `/new-impression`. The three-button bar is the same: `Renovation Details`, `Trash`, `Next Change`. Add: `await page.waitForURL(/\/new-impression\?source=impression&/)` after Generate. |
| "Renovation Details button navigates to timeline page" | After Generate, the page is on `/new-impression?source=impression&...`. Clicking `Renovation Details` reads `query.renovation` and navigates to `/renovation/<id>`. **Important rewrite**: assertion `await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/)` still passes, but the button must remain visible *while the URL still ends in /new-impression*. |
| "Trash button deletes impression and resets to mask step" | **Behaviour change**. After Trash from preview-of-just-generated impression, decision 6 says we navigate to `/renovation/<id>` (timeline) — the impression doc was deleted. The current assertion that we "reset to mask step with same source" no longer holds. Replace with: `await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/)` and `await expect(page.getByAltText("Result")).not.toBeVisible()`. (See **Test gap** below.) |
| "Next Change button navigates to new impression page" | The button now stays on `/new-impression`; only the stage changes. Replace `waitForURL(/\/renovation\/[a-zA-Z0-9]+\/new\?source=/)` with: `await expect(page.getByText("Paint the area you want to change")).toBeVisible()` (visibility check, since only stage flips). The URL should remain `?source=impression&...`. |
| "after Trash, can redo the flow with same image" | Update per the Trash change above. The "redo" flow now happens by clicking `Next Change` (still in preview after the new impression was created) rather than via "Trash → mask with same source". Concretely: replace the `Trash → fill prompt → Generate` second leg with `Next Change → mask → prompt → Generate`. |

### Test gap to discuss

Once Trash from a just-generated result navigates *away* (decision 6,
`source=impression` → delete impression → go to timeline), the only place
"Trash returns to mask with the same source" used to mean is gone. If you
prefer Trash-then-stay-and-redo, change decision 6 in `00-overview.md`.
**Default in this plan**: Trash navigates to timeline.

---

## `e2e/specs/renovations/new-impression.spec.ts`

This whole file targets `/renovation/:id/new`. Update every URL.

| Test | Change |
|------|--------|
| "loads source from original image (source=before) via timeline" | Rename describe text only. `waitForURL(/\/new\?source=before/)` → `waitForURL(/\/new-impression\?source=original&/)`. After-load assertion (`Paint the area...`) stays — but **stage is `preview`, not `mask`**, so the helper text uses `visibility: hidden` on the new layout. **Update**: assert that *the canvas is visible*, not the helper text. The helper text becomes visible only after a stroke or `Next Change`. Replace `getByText("Paint the area you want to change")` with `expect(page.locator('[data-testid="masking-canvas"]')).toBeVisible()`. Then drive `Next Change` to reach the mask helper text if a test needs it. |
| "loads source from impression result via timeline" | URL pattern `/new\?source=(?!before)/` → `/new-impression\?source=impression&renovation=[^&]+&impression=[^&]+/`. Otherwise same as above. |
| "loads source from Next Change button on result step" | `Next Change` no longer navigates — same-page transition. Replace `await page.waitForURL(/\/new\?source=/)` with `await expect(page.locator('[data-testid="masking-canvas"]')).toBeVisible()` (already true) and assert helper text **becomes visible** after Next Change. |
| "full flow: mask, prompt, generate, result with three-button bar" | Replace `waitForURL(/\/new\?source=/)` with the same-page transition assertion, then proceed as before. After Generate completes, assert URL `/\/new-impression\?source=impression&/`. |
| "back button navigates to timeline" | Same fix as above for the initial wait; the Back button still lands on `/renovation/<id>`. |
| "Trash on result resets to mask step with same source" | **Behaviour change** per decision 6. Either delete this test or rewrite it as: "Trash on result navigates to timeline; the just-generated impression is gone." |
| "Renovation Details button on result navigates to timeline" | Drop the explicit `waitForURL(/\/new\?source=/)`; assertions about both prompts on the timeline are unchanged. |
| "consecutive Next Change: second change loads correctly without refresh" | Two URL patterns to update; otherwise the chained flow still works since Generate's redirect to `?source=impression&...` is exactly what the current "Next Change navigates to source=<id>" expectation became. |
| "step navigation: back from prompt returns to mask" | URL pattern update only. |

---

## `e2e/specs/renovations/timeline.spec.ts`

| Test | Change |
|------|--------|
| "shows original image, completed impression, and prompt text" | None (timeline page changes are minor link rewrites). |
| "first impression is auto-starred" | None. |
| "back button navigates to home" | None. |
| "clicking original image navigates to new impression with source=before" | `waitForURL(/\/renovation\/[a-zA-Z0-9]+\/new\?source=before/)` → `waitForURL(/\/new-impression\?source=original&renovation=[a-zA-Z0-9]+/)`. The post-load assertion uses `getByText("Paint the area...")` — replace with the `data-testid="masking-canvas"` assertion (preview stage hides the text). |
| "clicking result image navigates to new impression with source=impressionId" | `waitForURL(/\/renovation\/[a-zA-Z0-9]+\/new\?source=(?!before)[a-zA-Z0-9]+/)` → `waitForURL(/\/new-impression\?source=impression&renovation=[a-zA-Z0-9]+&impression=[a-zA-Z0-9]+/)`. Same helper-text fix. |
| "trash button on impression deletes it from timeline" | None (this is the timeline-page Delete, not the wizard Trash). |
| "star toggle switches between impressions" | The intermediate `waitForURL(/\/new\?source=(?!before)[a-zA-Z0-9]+/)` becomes `waitForURL(/\/new-impression\?source=impression&/)`. The mask-helper-text assertion needs the same `Next Change` driver to reach mask before drawing. |
| "chaining: click result image, complete full impression flow, verify both on timeline" | URL pattern update; same `Next Change` driver before drawing. |

---

## `e2e/specs/renovations/impression.spec.ts`

| Test | Change |
|------|--------|
| "uploads image, triggers Cloud Function, and produces a result image" | URL `"/renovation/new?source=camera"` → `"/new-impression?source=photo"`. Three-button bar appears on the preview stage of the redirected URL — assertions stay. The `getByAltText("Result")` selector stays valid because the wizard renders the post-completion image inside the same `MaskingCanvas` (alt text comes from the canvas wrapper attribute). **Action**: confirm `MaskingCanvas` exposes the rendered image with `alt="Result"`, OR keep the existing fallback `<StorageImage alt="Result">` (preferred — less coupling). The wizard should render a stand-alone `<StorageImage alt="Result" path="..." class="visually-hidden">` during preview-of-completed-impression to keep the alt-text assertion stable. |

---

## `e2e/specs/renovations/home.spec.ts`

| Test | Change |
|------|--------|
| "Take Photo navigates to mask step with captured image" | URL update. |
| "cancelling camera input keeps user on home page" | None. |
| "shows renovation card after creation" | None. |
| "clicking renovation card navigates to timeline" | None. |
| "shows new renovation card", "shows user info in header", "new renovation card has upload button", "sign out navigates to login page" | None. |

---

## Component test

### `ct/new-renovation.ct.ts` — DELETE

The component it mounts (`old/NewRenovationPage.vue`) is being removed.
There is no clean component-test target for the new wizard at this point —
it depends on Firebase, IndexedDB, and a Storage round-trip. The E2E suite
covers the same surface.

If you want a CT for the wizard, scope it to the **mask stage** with a
pre-seeded `image-url` prop and a stubbed `useImpressionWizard` — this
takes a small amount of refactor in the wizard to accept an injected store.
Not required for cutover.

---

## New E2E tests worth adding

These are not strictly necessary for parity but cover the new contract:

1. **Refresh on mask stage keeps the source image**: photo path → reload →
   still on mask stage with canvas painted from IDB.
2. **Refresh on preview stage with source=original**: timeline-click →
   reload → IDB was missing → wizard re-fetches from Storage → preview
   visible.
3. **Crop page error when IDB empty**: navigate directly to `/crop` →
   error panel "No image to crop" with a back button.
4. **Paste flow end-to-end**: stub `navigator.clipboard.read` in-page,
   click Paste → land on `/crop` with the image.
5. **Stage transition on first paint stroke**: arrive at `/new-impression?
   source=original` → drag once → assert footer changes from preview
   bar (`Trash`, `Next Change`) to mask bar (`Trash`, `Next`) and helper
   text becomes visible.
