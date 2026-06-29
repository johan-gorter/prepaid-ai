# Reusing the photo-input flow (take / upload+crop / paste+crop)

The app lets a user supply an image three ways: **take a photo** (camera),
**upload + crop**, and **paste + crop**. This started as one-off code for the
renovation *source* photo, but it is now used by more than one feature (the
apply-material and add-furniture flows both supply a second reference image via
the same inline step). This doc explains how to reuse it so you don't copy-paste
the camera/crop logic again.

## The split: reusable *components*, per-feature *hosts*

The capture **mechanics** live in two pure components. Everything
feature-specific — copy, where the result is stored, where to go next, and the
funnel/measurement events — lives in the **host** that mounts them. Keeping the
mechanics in components (rather than in shared `/photo` and `/crop` *routes*)
means each use case keeps its own texts and its own funnel, which is exactly what
we want for measurement.

| Component | File | Contract |
| --------- | ---- | -------- |
| `CameraCapture` | `src/components/CameraCapture.vue` | Opens the rear camera and shows the live preview. Emits `ready(boolean)`, `error()`, and `capture(Blob)` (a square WebP; the stream is stopped before it fires). Exposes a `capture()` method so the host owns the shutter button. |
| `ImageCropper` | `src/components/ImageCropper.vue` | Pan/zoom/pinch square crop canvas. Props: `source: Blob`, `size?=1024`, `zoomInLabel?`, `zoomOutLabel?`. Exposes `getBlob(): Promise<Blob>` and an `isReady` ref so the host owns the confirm button. |

Neither component touches IndexedDB, navigates, or contains any user-facing
copy. The host decides all of that.

## Two worked examples

### 1. Room photo — dedicated full-screen pages

- `src/views/renovation/PhotoCapturePage.vue` (`/photo`) hosts `CameraCapture`:
  it renders the title/hints/footer, and on `@capture` writes
  `setImpressionSource(blob)`, clears the mask/draft, and routes to
  `/new-impression?source=photo`.
- `src/views/renovation/CropImagePage.vue` (`/crop`) hosts `ImageCropper`,
  reading the to-be-cropped blob from `getUncroppedSource()` and, on its own
  "Use image" button, calling `cropperRef.getBlob()` then storing + routing.
- The entry buttons live in `useImpressionInput.ts` /
  `NewRenovationCard.vue` / `FirstRenovationPage.vue`.

### 2. Apply-material / add-furniture — inline inside the wizard stage

`src/views/renovation/wizard/ReferenceCaptureStep.vue` hosts **both** components
inline (no route change), swapping a local `view: "pick" | "camera" | "crop"` so
the mask is preserved and the whole flow stays on `/new-impression` for a clean
funnel. One component serves both reference flows via a `kind:
"material" | "furniture"` prop, which namespaces its testids, i18n keys, IDB
source key, and registry subcollection so the two funnels stay separable. It
additionally shows a grid of previously-used references (the registry, below).
On confirm it stashes the blob under the `referenceSource:<kind>` IndexedDB key
and mirrors the selection to the parent via the `selectedPath` model — the
upload itself is deferred to Generate so it survives a buy-credits / sign-in
detour.

## Adding a new use case (the recipe)

1. **Decide where the result goes.** Either a fresh blob you upload at the end
   of the flow, or an existing path. Pick an IndexedDB key (see
   `useImpressionStore.ts`) if the blob must survive a navigation/auth detour;
   otherwise an in-memory `ref<Blob>` is enough.
2. **Host the components.** For a full-screen step, add a page like
   `PhotoCapturePage`/`CropImagePage`. For an in-flow step, mount them inline
   like `ReferenceCaptureStep` and switch a local `view` ref. Wire:
   - `CameraCapture`: `@ready`, `@error`, `@capture`; render your own
     shutter button calling `cameraRef.capture()`.
   - `ImageCropper`: pass `:source`, render your own confirm button calling
     `await cropperRef.getBlob()`.
3. **Own the copy.** Add your own i18n keys; the generic button labels
   (`newRenovation.takePhoto/uploadImage/pasteImage`) and `crop.*` zoom labels
   are reusable.
4. **Own the funnel.** Fire your own `track(...)` events at the points that
   matter for your feature.
5. **Upload + (optionally) remember.** If your feature benefits from a reuse
   registry, follow the materials pattern: hash-dedupe the blob into
   `users/{uid}/<thing>/{hash}` in Storage + Firestore, add an owner-only
   subcollection rule in `firestore.rules`, and resolve thumbnails through
   `StorageImage` / `resolveStorageUrl`.
6. **E2E bypass.** Live camera doesn't work headless. Add a hidden
   `data-testid="...-camera-input"` file input that turns a `setInputFiles` file
   directly into the captured blob (mirror the room flow's `camera-input` and
   the reference flow's `<kind>-camera-input`).

## The reference-image registries (reuse pattern)

`src/data/referenceImageRepo.ts` + `src/composables/useReferenceImagesList.ts`
remember the references a user has applied, per kind (a `materials` and a
`furniture` Firestore subcollection), so repeat use is two taps. Dedupe is by
content hash: the Firestore doc id and the Storage object name are both the
SHA-256 of the bytes (`hashBlob`), so `getOrCreateReferenceImage(uid, kind,
blob)` reuses the object when a reference is seen again and bumps `createdAt` for
recency. Because this lives under `users/{uid}` in Firestore it persists across
devices and survives sign-out (unlike the IndexedDB drafts, which are wiped on
sign-out). Adding another reference kind is just a new entry in the kind→
collection map plus an owner-only subcollection rule in `firestore.rules`.
