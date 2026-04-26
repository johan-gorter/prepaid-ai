# Storage and Routing

## IndexedDB schema

Single database, two object stores. All blobs are 1024×1024 `image/webp`.

```
DB:    payasyougo-impressions   (version 1)
Store: images                   (keyPath: implicit string keys)
  key: "uncroppedImpressionSource"  → Blob   (raw user image, not yet 1024²)
  key: "impressionSource"           → Blob   (the maskable 1024² image)
```

Why IndexedDB and not `sessionStorage`/`localStorage`:
- Source/result images can be ≈1–4 MB as data URLs and trip the 5 MB
  per-origin storage cap of `localStorage` after a few iterations.
- Native blob storage avoids the round-trip to data URL and back.
- Survives a hard refresh on every browser the PWA targets.

### Key contract

| Key | Set by | Read by | Cleared by |
|-----|--------|---------|------------|
| `uncroppedImpressionSource` | `NewRenovationCard` (Upload, Paste) | `/crop` page | `/crop` on confirm or cancel |
| `impressionSource` | `/photo`, `/crop` (after confirm), `RenovationDetailPage` (timeline-click handler — see below), `/new-impression` (after Generate writes the result) | `/new-impression` | `/new-impression` on Trash from `source=photo`/`crop`; on the next overwrite |

### Composable: `src/composables/useImpressionStore.ts` (NEW)

```ts
const DB_NAME = "payasyougo-impressions";
const STORE = "images";
const SOURCE = "impressionSource";
const UNCROPPED = "uncroppedImpressionSource";

async function open(): Promise<IDBDatabase> { /* idempotent open at v1 */ }

export async function setImpressionSource(blob: Blob): Promise<void>
export async function getImpressionSource(): Promise<Blob | null>
export async function clearImpressionSource(): Promise<void>

export async function setUncroppedSource(blob: Blob): Promise<void>
export async function getUncroppedSource(): Promise<Blob | null>
export async function clearUncroppedSource(): Promise<void>

// Convenience for the wizard preview/mask stages — caller is responsible
// for revoking the URL when the source changes.
export async function getImpressionSourceObjectUrl(): Promise<string | null>
```

The composable returns Promises (not refs); the wizard reads once on each
stage transition where needed.

### Refresh contract

On `/new-impression` mount:

1. Read `?source` from the route. If absent → redirect `/renovations`.
2. Read `IDB[impressionSource]`:
   - If present → use it as the maskable image; pick first stage based on
     `source` (preview for `original`/`impression`, mask for `photo`/`crop`).
   - If absent and `source` is `original` or `impression` → re-fetch the
     image from Storage using the renovation/impression IDs in the query
     string, write it back to IDB, then proceed.
   - If absent and `source` is `photo` or `crop` → show a friendly error
     "Source image is missing" with a button back to `/renovations`. (This
     is the only error path that can happen from a dropped IDB entry on
     fresh-source flows.)

The crop page enforces the same contract for `uncroppedImpressionSource`:
on mount, if missing, render an error panel "No image to crop" with a
button back to `/renovations`. (Old code silently `router.replace`d — the
new spec calls for a visible error.)

## Routing changes

`src/router/index.ts`:

```ts
// Removed
{ path: "/renovation/new",       name: "new-renovation",   ... }
{ path: "/renovation/camera",    name: "camera-capture",   ... }
{ path: "/renovation/crop",      name: "crop-image",       ... }
{ path: "/renovation/:id/new",   name: "new-impression",   ... }
{ path: "/dev/masking-test",     name: "masking-test",     ... }   // see below

// Added
{ path: "/photo",          name: "photo",           component: () => import("../views/PhotoCapturePage.vue"),  meta: { requiresAuth: true } }
{ path: "/crop",           name: "crop",            component: () => import("../views/CropImagePage.vue"),     meta: { requiresAuth: true } }
{ path: "/new-impression", name: "new-impression",  component: () => import("../views/NewImpressionPage.vue"), meta: { requiresAuth: true } }
```

The `/dev/masking-test` route is currently lazy-loaded from
`old/MaskingTestPage.vue`. Either delete the route (recommended) or move
the file out of `old/` and keep it. **Default: delete.**

### URL contract for `/new-impression`

| Source | Query string |
|---|---|
| Photo (just captured) | `?source=photo` |
| Crop (just confirmed) | `?source=crop` |
| Click on Original (timeline) | `?source=original&renovation=<id>` |
| Click on Impression result (timeline) | `?source=impression&renovation=<id>&impression=<id>` |
| After successful Generate | `?source=impression&renovation=<id>&impression=<id>` (router.replace) |

`source=original` and `source=impression` are the only sources where the
wizard knows a renovation already exists; all other actions create a new
renovation at upload time.

### Stage map

```
source=photo          → mask    (preview not used — there is nothing to preview yet)
source=crop           → mask
source=original       → preview
source=impression     → preview
```

Inside the wizard, "stage" is local state — **never** reflected in the URL.
This avoids URL-hash pollution and keeps Back behaviour predictable: header
back exits the wizard.

## Stage transitions (state machine)

```
preview ──[paint stroke OR Next Change pressed]──▶ mask
mask    ──[Next pressed]                         ─▶ prompt
prompt  ──[Back pressed]                         ─▶ mask
prompt  ──[Generate pressed]                     ─▶ processing
processing ──[completion]                        ─▶ (router.replace, page remounts in preview)
processing ──[failure]                           ─▶ prompt   (with error)
preview ──[Trash pressed]   ─▶ navigate away (see decision 6)
preview ──[Back pressed]    ─▶ navigate away (renovations list, or timeline if a renovation exists)
mask    ──[Trash pressed]   ─▶ navigate away
```

There is no Back button in `preview`; the header arrow handles "exit".
There is no Back from `mask` — Back only exists in `prompt` (per E2E).

## Header back-button targets

| When | Target |
|---|---|
| `source=photo` / `crop` | `/renovations` |
| `source=original` / `impression` | `/renovation/<renovation>` (timeline) |

This matches the current E2E spec
`new-impression.spec.ts › back button navigates to timeline`.
