# Migration Checklist

A suggested implementation order. Each step compiles and passes the
already-modified subset of tests, so progress is visible incrementally.

## Step 1 — IndexedDB plumbing (no UI change)

- [ ] Add `src/composables/useImpressionStore.ts`.
- [ ] Add a small unit-style smoke test (CT or vitest if available) that
      `set → get → clear` round-trips a Blob.
- [ ] Type-check passes (`npm -s run typecheck:all`).

## Step 2 — Photo and Crop pages (parallel to old)

- [ ] Copy `old/CameraCapturePage.vue` → `src/views/PhotoCapturePage.vue`.
      Wire it to write `IDB[impressionSource]` and navigate to
      `/new-impression?source=photo`.
- [ ] Copy `old/CropImagePage.vue` → `src/views/CropImagePage.vue`. Wire
      it to read `IDB[uncroppedImpressionSource]`, write
      `IDB[impressionSource]`, navigate to `/new-impression?source=crop`,
      and render an error panel on missing input.
- [ ] Add routes `/photo` and `/crop` in the router. Leave the old
      routes in place for now.
- [ ] **Don't** wire the renovations card to these yet.

## Step 3 — Unified wizard

- [ ] Add `src/views/NewImpressionPage.vue` (and optionally
      `src/composables/useImpressionWizard.ts`).
- [ ] Add the `/new-impression` route.
- [ ] Implement, in order: source loading, the four stages, generate,
      Trash/Back/Next/Next Change/Retake.
- [ ] Run the existing E2E suite — every renovation test should still
      pass because the old routes are untouched.

## Step 4 — Cutover the renovations card

- [ ] Rewrite `NewRenovationCard.vue` handlers (Take Photo / Upload /
      Paste / hidden camera-input) per `03-components-and-composables.md`.
- [ ] Update `RenovationDetailPage.vue::navigateToNewImpression` to push
      `/new-impression` with the new query params.
- [ ] Update `e2e/helpers/renovation.ts` to wait for the new URLs.
- [ ] Update each renovation E2E spec per `04-tests.md`.
- [ ] Delete `ct/new-renovation.ct.ts`.
- [ ] Run `npm -s run test:ct` and `npm -s run test:e2e` — all green.

## Step 5 — Remove the old code

- [ ] Verify no references: `rg "renovation/old" src ct e2e`.
- [ ] Delete `src/views/renovation/old/`.
- [ ] Delete the four old routes in `src/router/index.ts`.
- [ ] Run `npm -s run typecheck:all` and `npm -s run build` — both pass.

## Step 6 — Polish

- [ ] Verify the four-stage layout invariant in a real browser at mobile
      sizes (the wizard image must not shift between preview / mask /
      prompt / processing).
- [ ] Verify the `prompt` stage on iPhone SE-class viewports: textarea,
      `Back`, and `Generate` all stay visible above the on-screen keyboard.
      The keyboard-inset system (`--kb-inset`) handles this — see
      [`docs/layout-and-scrolling.md`](../../layout-and-scrolling.md) for the
      full contract.
- [ ] Manually test all four `?source` values plus a hard refresh on each
      stage of each.
- [ ] Manually test offline refresh for `source=original`/`impression`
      after the source has been cached once.

## What to copy verbatim

| From | To | Notes |
|------|----|----|
| `old/CameraCapturePage.vue` (177 lines) | `views/PhotoCapturePage.vue` | All template / styles / lifecycle. Replace `handleCapture` body and `onCancel` target. |
| `old/CropImagePage.vue` (379 lines) | `views/CropImagePage.vue` | All template / styles / lifecycle / pinch-zoom. Replace mount, `handleConfirm`, `handleCancel`. Add error panel. |
| `old/NewImpressionPage.vue` `handleSubmit` (lines 158–196) | `views/NewImpressionPage.vue::handleGenerate` (existing-renovation branch) | Mask uploading and `createImpression` calls. |
| `old/NewRenovationPage.vue` `handleSubmit` (lines 215–263) | `views/NewImpressionPage.vue::handleGenerate` (new-renovation branch) | Original upload + `createRenovation`. |
| `old/NewImpressionPage.vue` impression watchers (lines 47–61, 78–95) | `views/NewImpressionPage.vue::waitForCompletion` | Identical contract. |
| `old/NewImpressionPage.vue::handleTrash` (lines 198–210) | `views/NewImpressionPage.vue::onTrash` (`source=impression` branch) | Same `deleteImpression` call. |
| `old/NewRenovationPage.vue::handleTrash` (lines 265–281) | (split): `source=impression` branch reuses `deleteImpression`; `source=photo`/`crop` branch is new (just clear IDB). |
| `old/NewImpressionPage.vue::loadSourceImage` (lines 96–143) | `views/NewImpressionPage.vue::fetchAndCacheSource` | Same Firestore path resolution; only difference is writing the result back into IDB. |

## What to delete

- `src/views/renovation/old/` (entire directory)
- `ct/new-renovation.ct.ts`
- Routes: `new-renovation`, `camera-capture`, `crop-image`, the old
  `new-impression` (path `/renovation/:id/new`), `masking-test`.
- All `sessionStorage.getItem("croppedImage")` /
  `sessionStorage.setItem("cropImage")` references (they live only in old
  files and `NewRenovationCard.vue`).

## Risk register

- **IndexedDB on private browsing**: Some browsers block IDB in private
  mode. The wizard must surface a clear error when `setImpressionSource`
  rejects, not silently fail. Wrap each IDB call's promise in a try/catch
  inside the calling page.
- **Service worker caching of `/new-impression`**: The PWA precache
  fallback needs to recognise the new route. The Vite PWA plugin already
  uses an SPA fallback to `index.html`, so no manifest change is needed,
  but verify on the PWA test suite (`npm -s run test:pwa`).
- **Layout invariance**: The plan calls for the maskable image to stay in
  the same position across stages. Use `visibility: hidden` on per-stage
  helper text and absolute-position the prompt overlay over the canvas's
  upper half. Don't use `v-if` on elements that affect the canvas's box.
- **Refresh during `processing`**: A refresh during processing loses the
  ephemeral `prompt` and the subscription. Acceptable: on remount, the
  wizard will be in `mask` stage (`source=photo`/`crop` branch) or
  `preview` (`original`/`impression` branch); the impression doc that was
  created keeps processing in the background and will appear on the
  timeline once the function finishes. This is a regression to fix later
  if the user wants — note in `00-overview.md` open questions if so.
