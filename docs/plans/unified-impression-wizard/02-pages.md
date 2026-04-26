# Pages — Fine-grained changes

This document specifies, per page, what to copy from `src/views/renovation/old/`,
what to change, what to add, and what to delete. Line numbers reference the
files at HEAD on the feature branch.

---

## `src/views/PhotoCapturePage.vue` (NEW)

Copy almost verbatim from `src/views/renovation/old/CameraCapturePage.vue`
(177 lines).

Changes:

1. Replace the `handleCapture` body's storage + navigation (lines 66–69):

   ```ts
   // OLD
   const dataUrl = canvas.toDataURL("image/webp");
   stopStream();
   sessionStorage.setItem("croppedImage", dataUrl);
   router.push("/renovation/new?source=camera");

   // NEW
   const blob = await new Promise<Blob>((resolve, reject) =>
     canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/webp"),
   );
   stopStream();
   await setImpressionSource(blob);
   router.push("/new-impression?source=photo");
   ```

2. Replace `handleCancel` target `"/renovations"` (line 74) — unchanged.
3. Update header title from `"Take Photo"` to `"Take Photo"` — unchanged.
4. Import `setImpressionSource` from `../composables/useImpressionStore`.

No other markup or styling changes are required.

---

## `src/views/CropImagePage.vue` (NEW)

Copy almost verbatim from `src/views/renovation/old/CropImagePage.vue`
(379 lines). It already has all crop / pinch-zoom logic worth keeping.

Changes:

1. Replace `onMounted` body (lines 33–65):

   ```ts
   // OLD
   const dataUrl = sessionStorage.getItem("cropImage");
   if (!dataUrl) { router.replace("/renovation/new"); return; }
   const img = new Image(); img.onload = () => { ... }; img.src = dataUrl;

   // NEW
   const blob = await getUncroppedSource();
   if (!blob) {
     errorMessage.value = "No image to crop. Please go back and try again.";
     return;
   }
   const url = URL.createObjectURL(blob);
   const img = new Image();
   img.onload = () => { /* unchanged */ URL.revokeObjectURL(url); };
   img.src = url;
   ```

   Add `errorMessage = ref<string | null>(null)` and render the error panel
   instead of the canvas when set. (Match the error panel style in
   `old/CameraCapturePage.vue` lines 102–107.)

2. Replace `handleConfirm` (lines 262–271):

   ```ts
   // OLD
   const dataUrl = canvas.toDataURL("image/webp");
   sessionStorage.setItem("croppedImage", dataUrl);
   sessionStorage.removeItem("cropImage");
   router.push("/renovation/new?source=cropped");

   // NEW
   const blob = await new Promise<Blob>((resolve, reject) =>
     canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/webp"),
   );
   await setImpressionSource(blob);
   await clearUncroppedSource();
   router.push("/new-impression?source=crop");
   ```

3. Replace `handleCancel` (lines 273–276):

   ```ts
   await clearUncroppedSource();
   router.push("/renovations");
   ```

4. Imports: add `setImpressionSource`, `getUncroppedSource`,
   `clearUncroppedSource` from `../composables/useImpressionStore`.

No markup changes beyond the new `errorMessage` panel.

---

## `src/views/NewImpressionPage.vue` (NEW — the unified wizard)

This page **replaces both** `old/NewRenovationPage.vue` (527 lines) and
`old/NewImpressionPage.vue` (401 lines).

### Shape (single root, four stages)

```vue
<template>
  <div class="page-layout">
    <header class="fixed">
      <nav>
        <button class="transparent circle" @click="onBack" aria-label="← Back">
          <i aria-hidden="true">arrow_back</i>
        </button>
        <h1 class="max">{{ headerTitle }}</h1>
        <UserMenu />
      </nav>
    </header>

    <main class="responsive wizard-main">
      <!-- Per-stage helper text. Always rendered; visibility hidden when
           it is not the active stage so the canvas underneath does not
           shift. -->
      <p :class="['small-text', { 'visually-hidden': stage !== 'mask' }]">
        Paint the area you want to change (shown in red)
      </p>

      <!-- Same canvas across preview, mask, processing. The MaskingCanvas
           is mounted once. Pointer events are ignored in preview/processing
           by toggling its container CSS (`pointer-events: none`). -->
      <MaskingCanvas
        v-if="sourceObjectUrl"
        ref="maskingRef"
        :image-url="sourceObjectUrl"
        :class="{ inert: stage === 'preview' || stage === 'processing' }"
        @pointerdown.capture="onCanvasPointerDown"
      />

      <!-- Prompt overlay sits on top half of the image during prompt stage -->
      <div v-show="stage === 'prompt'" class="prompt-overlay">
        <div class="field textarea label border round">
          <textarea id="prompt-input" data-testid="prompt"
                    v-model="prompt" rows="4" placeholder=" " autofocus />
          <label for="prompt-input">What should change in the red area?</label>
        </div>
      </div>

      <!-- Processing/error overlay -->
      <div v-show="stage === 'processing'" class="processing-overlay center-align">
        <progress class="circle"></progress>
        <p>Creating your impression...</p>
      </div>

      <p v-if="errorMessage" class="error-text center-align">{{ errorMessage }}</p>
    </main>

    <StickyFooter v-if="stage !== 'processing'">
      <!-- Renders the appropriate per-stage button bar; see "Footers" below -->
      <component :is="footerComponent" v-bind="footerProps" />
    </StickyFooter>
  </div>
</template>
```

Critical: the `MaskingCanvas` mounts **once** for the lifetime of the page
and is the same DOM element across stages. Stage helper texts use
`visibility: hidden` (via `.visually-hidden`) — **not** `display: none` —
so the canvas's box does not shift when the active stage changes.

### Stage state

```ts
type Stage = "preview" | "mask" | "prompt" | "processing";
const stage = ref<Stage>(initialStage());
```

`initialStage()`:
- `source=original` or `source=impression` → `"preview"`
- `source=photo` or `source=crop` → `"mask"`

### Mount sequence

```ts
onMounted(async () => {
  const source = route.query.source as string;
  if (!source) { router.replace("/renovations"); return; }

  let blob = await getImpressionSource();
  if (!blob) {
    if (source === "original" || source === "impression") {
      // refresh-recovery from Firebase Storage
      blob = await fetchAndCacheSource(source, route.query);
    }
    if (!blob) {
      errorMessage.value = "Source image is missing.";
      return;
    }
  }
  sourceObjectUrl.value = URL.createObjectURL(blob);
});
```

`fetchAndCacheSource` reads:
- `source=original`: `users/<uid>/renovations/<renovation>` → `originalImagePath`
- `source=impression`: `users/<uid>/renovations/<renovation>/impressions/<impression>` → `resultImagePath`

It calls `resolveStorageUrl(path)` (existing helper), `fetch`es the bytes,
stores the blob under `IDB[impressionSource]`, and returns it.

### Footers

| Stage | Buttons (left-to-right) |
|---|---|
| `preview` | `Back` (header), `Trash`, `Next Change` |
| `mask` | `Back` (header), `Retake` (when `source=photo`), `Trash`, `Next` |
| `prompt` | `Back`, `Generate` |
| `processing` | (no footer — buttons hidden) |

`source=photo` is the only state where the footer's `Retake` button is
visible (matches the existing E2E expectation in `new-renovation.spec.ts`).
For `source=crop` we **omit** Retake — there is no obvious retake target.

### Generate (the only Storage write path)

```ts
async function handleGenerate() {
  stage.value = "processing";
  try {
    const uid = currentUser.value.uid;
    const ts = Date.now();

    // Decide the renovation: existing for original/impression, new for photo/crop
    let renovationId = route.query.renovation as string | undefined;
    let originalImagePath: string;

    if (!renovationId) {
      // photo / crop → upload the source as the new renovation's "original"
      originalImagePath = `users/${uid}/originals/${ts}.webp`;
      const sourceBlob = await getImpressionSource();
      await uploadBytes(storageRef(storage, originalImagePath), sourceBlob!);
      renovationId = await createRenovation({ originalImagePath });
    } else {
      // existing renovation — sourceImagePath is the impression's input
      const renoSnap = await getDoc(doc(db, "users", uid, "renovations", renovationId));
      originalImagePath = renoSnap.data()!.originalImagePath;
    }

    // Resolve the impression's `sourceImagePath`:
    //   source=original         → renovation's originalImagePath
    //   source=impression       → that impression's resultImagePath
    //   source=photo|crop       → originalImagePath we just uploaded
    const sourceImagePath = await resolveSourceImagePath(...);

    // Upload composite (mask painted on source)
    const compositeImagePath = `users/${uid}/composites/${ts}.webp`;
    await uploadBytes(storageRef(storage, compositeImagePath),
                      await maskingRef.value!.getCompositeBlob());

    // Create the impression doc
    const impressionId = await createImpression(renovationId, {
      sourceImagePath, compositeImagePath, prompt: prompt.value.trim(),
    });

    // Watch impressions collection until status === 'completed'
    const resultPath = await waitForCompletion(renovationId, impressionId);

    // Replace IDB source with the rendered result, then redirect into preview
    const url = await resolveStorageUrl(resultPath);
    const blob = await fetch(url).then((r) => r.blob());
    await setImpressionSource(blob);

    router.replace({
      path: "/new-impression",
      query: { source: "impression", renovation: renovationId, impression: impressionId },
    });
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : "Unknown error";
    stage.value = "prompt";
  }
}
```

`waitForCompletion` is a thin wrapper around `useImpressions` that resolves
when the impression's `status === "completed"` or rejects on `"failed"`.

### Trash (per source)

```ts
async function onTrash() {
  const src = route.query.source as string;
  if (src === "impression") {
    await deleteImpression(renovationId, impressionId);
    router.replace(`/renovation/${renovationId}`);
  } else if (src === "original") {
    if (!confirm("Delete this renovation and all its impressions?")) return;
    await deleteRenovation(renovationId);
    router.replace("/renovations");
  } else {
    // photo / crop
    await clearImpressionSource();
    router.replace("/renovations");
  }
}
```

(The current E2E expectation that `Trash` from a result step "resets to
mask step with same source" must change for the unified flow — see
`04-tests.md` for the rewritten assertion.)

### `Next Change` (preview stage)

```ts
function onNextChange() {
  // The current source image is *already* in IDB, so we just transition.
  stage.value = "mask";
  // Force MaskingCanvas to clear its mask but keep the same image.
  maskingRef.value?.clearMask();
}
```

### `Retake` (mask stage, source=photo only)

```ts
async function onRetake() {
  await clearImpressionSource();
  router.replace("/photo");
}
```

### Header back

```ts
function onBack() {
  const reno = route.query.renovation as string | undefined;
  router.push(reno ? `/renovation/${reno}` : "/renovations");
}
```

---

## `src/views/renovation/RenovationsPage.vue` (MODIFIED)

No structural changes; the `NewRenovationCard` continues to live here. The
card itself is rewritten — see `03-components-and-composables.md`.

---

## `src/views/renovation/RenovationDetailPage.vue` (MODIFIED)

The page already navigates via `navigateToNewImpression(source)` on
clicks (lines 106–108, 178, 216). Replace its body:

```ts
// OLD
function navigateToNewImpression(source: string) {
  router.push(`/renovation/${renovationId.value}/new?source=${source}`);
}

// NEW — splits original vs impression and seeds IndexedDB so the wizard
// can paint without an extra round-trip on this device.
async function navigateToNewImpression(target: "original" | string) {
  const renoId = renovationId.value;
  if (target === "original") {
    router.push({
      path: "/new-impression",
      query: { source: "original", renovation: renoId },
    });
  } else {
    router.push({
      path: "/new-impression",
      query: { source: "impression", renovation: renoId, impression: target },
    });
  }
}
```

Update the two call sites (line 178, line 216):

```html
<!-- line 178 -->
@click="navigateToNewImpression('original')"
<!-- line 216 -->
@click="navigateToNewImpression(impression.id)"
```

The plan said the timeline page should "store impressionSource and go to
newImpression page". We do **not** pre-seed IDB here — the wizard's
`fetchAndCacheSource` already handles that on mount. Pre-seeding here
would just double the work. (If you want to override and pre-seed for
faster perceived loads, do it in this same function before pushing.)

---

## `src/views/renovation/old/` (DELETE after cutover)

Delete the entire directory once the new pages are in and tests pass:

```
src/views/renovation/old/CameraCapturePage.vue
src/views/renovation/old/CropImagePage.vue
src/views/renovation/old/MaskingTestPage.vue
src/views/renovation/old/NewImpressionPage.vue
src/views/renovation/old/NewRenovationPage.vue
```

Make sure no other files import from `old/` first:

```bash
rg "renovation/old" src ct e2e
```
