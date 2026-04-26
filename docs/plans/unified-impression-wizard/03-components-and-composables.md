# Components and Composables

## `src/components/NewRenovationCard.vue` (MODIFIED)

Current implementation at HEAD writes data URLs into `sessionStorage` and
navigates to old routes. Rewrite the three handlers:

```ts
// Take Photo button (visible button, line 73–76 today)
function onTakePhoto() { router.push("/photo"); }

// Hidden camera-input — kept for E2E setInputFiles bypass (line 11–22 today)
async function onCameraSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file?.type.startsWith("image/")) return;

  // The bypass synthesises a "fresh photo": store the file (it is already
  // a 1024² PNG in tests) under impressionSource and skip /photo entirely.
  await setImpressionSource(file);
  router.push("/new-impression?source=photo");
}

async function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file?.type.startsWith("image/")) return;
  await setUncroppedSource(file);
  router.push("/crop");
}

async function onPasteImage() {
  pasteError.value = null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const t = item.types.find((x) => x.startsWith("image/"));
      if (t) {
        await setUncroppedSource(await item.getType(t));
        router.push("/crop");
        return;
      }
    }
    pasteError.value = "No image found on clipboard";
  } catch {
    pasteError.value = "Could not access clipboard";
  }
}
```

Imports: `setImpressionSource`, `setUncroppedSource` from
`../composables/useImpressionStore`.

`data-testid="camera-input"`, `data-testid="paste-image-btn"`, and
`data-testid="new-renovation-card"` must remain (E2E selectors).

The "Take Photo" button now navigates to `/photo`. There is no longer a
"Take Photo via file input" path on the card (the old `onCameraSelected`
went straight to the wizard); the file input remains hidden and is only
exercised by E2E.

---

## `src/components/MaskingCanvas.vue` (UNCHANGED)

Re-used as-is. The wizard mounts it once and toggles `pointer-events` on
the wrapper to disable strokes during `preview` and `processing`.

The component exposes `clearMask`, `getOriginalBlob`, `getCompositeBlob`
(line 402). All three remain in use.

### Suggested non-blocking enhancement

Consider exposing `hasMask(): boolean` so the wizard can detect "user
started painting" and auto-transition `preview → mask`. Without it, the
wizard can listen for the first `pointerdown` event on the canvas wrapper
and transition then.

---

## `src/components/StickyFooter.vue` (UNCHANGED)

Still used for the per-stage footer.

---

## `src/components/StorageImage.vue` (UNCHANGED)

Used by timeline / list pages, not by the wizard.

---

## `src/composables/useImpressionStore.ts` (NEW)

See schema in `01-storage-and-routing.md`. Implementation outline:

```ts
const DB_NAME = "payasyougo-impressions";
const STORE = "images";

let dbPromise: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode: IDBTransactionMode) {
  const db = await open();
  return db.transaction(STORE, mode).objectStore(STORE);
}

async function get(key: string): Promise<Blob | null> {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const r = store.get(key);
    r.onsuccess = () => resolve((r.result as Blob | undefined) ?? null);
    r.onerror = () => reject(r.error);
  });
}

async function put(key: string, value: Blob): Promise<void> { /* ... */ }
async function del(key: string): Promise<void> { /* ... */ }

export const setImpressionSource = (b: Blob) => put("impressionSource", b);
export const getImpressionSource = () => get("impressionSource");
export const clearImpressionSource = () => del("impressionSource");

export const setUncroppedSource = (b: Blob) => put("uncroppedImpressionSource", b);
export const getUncroppedSource = () => get("uncroppedImpressionSource");
export const clearUncroppedSource = () => del("uncroppedImpressionSource");
```

No Vue refs are exported — the wizard reads on mount and on stage changes
where required, and constructs Object URLs at the call site.

---

## `src/composables/useImpressionWizard.ts` (NEW, optional)

Optional. The wizard page stays small if we extract the stage machine and
the `Generate` orchestration here. If you prefer a single-file wizard,
skip this composable and inline.

```ts
export function useImpressionWizard(routeQuery: ComputedRef<LocationQuery>) {
  const stage = ref<Stage>(...);
  const sourceObjectUrl = ref<string | null>(null);
  const errorMessage = ref<string | null>(null);
  const prompt = ref("");

  async function loadSource(): Promise<void> { /* IDB read + Storage fallback */ }
  async function generate(maskingRef: MaskingCanvasRef): Promise<{ renovationId: string; impressionId: string }> { /* ... */ }
  function onCanvasPointerDown() { if (stage.value === "preview") stage.value = "mask"; }
  function onNextChange() { /* preview → mask */ }
  // ... onTrash, onBack, onRetake

  return { stage, sourceObjectUrl, errorMessage, prompt, loadSource, generate, ... };
}
```

If extracted: `NewImpressionPage.vue` ends up ~120 lines (template + thin
wiring); the composable owns the logic. Default in this plan: extract.

---

## `src/composables/useImpressions.ts` (UNCHANGED)

Re-used as the source of truth for the watch-for-completion loop.

---

## `src/composables/useRenovations.ts` (UNCHANGED)

Re-used. `createRenovation`, `createImpression`, `deleteImpression`,
`deleteRenovation` all called by the wizard exactly as before.

---

## `src/firebase.ts`, `src/composables/useStorageUrl.ts` (UNCHANGED)

Re-used by the wizard's `fetchAndCacheSource` and post-completion blob
fetch.
