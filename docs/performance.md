# Performance

## Principles

The app is designed to feel like a native app. That means:

- **Instant startup.** The app shell loads from the service worker precache — no network round-trip, no spinner before the UI appears.
- **Offline-first data.** Firestore data is read from a local IndexedDB cache first. The network is used to sync, not to block rendering.
- **Offline-first images.** Firebase Storage image bytes are cached by the service worker after first view. Subsequent loads — including full offline refreshes — are served from the cache at memory speed.
- **No redundant URL resolution.** Firebase Storage download URLs are persisted in `localStorage` after the first `getDownloadURL()` call. Revisiting a page skips the URL-resolution network call entirely.
- **Lean initial bundle.** Firebase Auth (~250 KB) is a separate async chunk loaded only when the sign-in flow starts, keeping the initial parse-and-execute cost low.

What this means in practice:

- A user who has visited the app before and goes offline will still see all their renovations and images exactly as they were on the last online visit.
- A user who opens the app on a slow or flaky connection will see data immediately from the local cache while Firestore silently syncs in the background.
- The first time a user signs in and their images are loaded for the first time, the images must come from the network — this is unavoidable. Every subsequent load of those same images is served from cache.

---

## Implementation

### 1. App shell precaching (service worker)

`src/sw.ts` is a custom Workbox service worker compiled by `vite-plugin-pwa` using the `injectManifest` strategy. At build time, Workbox injects `self.__WB_MANIFEST` — a list of every hashed JS, CSS, HTML, icon, and image asset produced by Vite. The service worker precaches all of these on install.

```typescript
// src/sw.ts
precacheAndRoute(self.__WB_MANIFEST);
```

The manifest glob pattern is configured in `vite.config.ts`:

```typescript
injectManifest: {
  globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
},
```

A `NavigationRoute` fallback ensures SPA deep-links (e.g. `/renovation/abc123`) are served `index.html` from the precache when the browser would otherwise make a network request:

```typescript
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));
```

Result: the entire app shell — UI, Vue runtime, Firebase SDK, router — loads from the local cache on every visit after the first.

### 2. Firestore offline persistence (IndexedDB)

`src/firebase.ts` initialises Firestore with `persistentLocalCache` and `persistentMultipleTabManager`:

```typescript
export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
```

All `onSnapshot` listeners in `useRenovations` and `useImpressions` return data from the IndexedDB cache immediately, then update reactively when the network delivers fresher data. Writes are queued locally and synced when connectivity is restored.

### 3. Firebase Storage image runtime caching (service worker)

`src/sw.ts` registers a cache-first route for all Firebase Storage image GET requests:

```typescript
registerRoute(
  ({ url, request }) =>
    request.method === "GET" &&
    request.destination === "image" &&
    isFirebaseStorageObjectUrl(url),
  async ({ request, url }) => {
    const cache = await caches.open(firebaseImageCacheName); // "firebase-storage-images-v1"
    const cacheKey = buildCacheKey(url); // strips query params (auth tokens) from the key
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) return cachedResponse;
    const networkResponse = await fetch(request);
    if (networkResponse.ok) await cache.put(cacheKey, networkResponse.clone());
    return networkResponse;
  },
);
```

The cache key normalisation (`origin + pathname`, query params stripped) is critical: Firebase Storage download URLs include a short-lived `token` query parameter. Without stripping it, the same image object would accumulate duplicate cache entries each time the URL is resolved.

Both the production Storage endpoint (`firebasestorage.googleapis.com`) and the local emulator endpoint (`127.0.0.1:9199`) are matched.

### 4. Download URL persistence (localStorage)

`src/composables/useStorageUrl.ts` implements a three-layer URL resolution cache:

1. **In-memory map** (`Map<string, string>`) — zero-cost lookup within a session.
2. **`localStorage`** (key `storage-download-url-cache-v1`) — survives page reloads and sign-out/sign-in cycles.
3. **`getDownloadURL()`** — network call, used only on a true cold miss.

On a cached hit (layers 1 or 2) the composable returns the URL synchronously before the component renders, so `loading` is never set to `true` and no spinner is shown.

Inflight deduplication (`inflightUrlCache`) ensures that if multiple components simultaneously request the URL for the same storage path, only one `getDownloadURL()` call is made.

### 5. Persistent storage permission

`src/main.ts` requests the `persistent` storage permission on startup:

```typescript
navigator.storage?.persist?.();
```

Without this, the browser may evict the service worker caches and IndexedDB data under storage pressure. With it, the OS treats the cached data as durable and only removes it when the user explicitly clears site data.

### 6. Code splitting

`vite.config.ts` splits the bundle into four chunks:

| Chunk | Contents |
|---|---|
| `index-<hash>.js` | App code (views, composables, router) |
| `vue-<hash>.js` | Vue 3, Vue Router, Pinia, VueFire |
| `firebase-<hash>.js` | Firestore, Storage, App SDK |
| `firebase-auth-<hash>.js` | Firebase Auth — loaded lazily on sign-in |

Page components are also dynamically imported via the Vue Router config, so only the code for the current route is parsed on navigation.

---

## How the app updates itself

When a new version of the app is deployed, the following happens automatically:

1. **Detection.** The browser checks for a new `sw.js` on every page load and on periodic background sync. If the content has changed (new asset hashes from the latest build), a new service worker enters the `installing` state.

2. **Precaching.** The new service worker precaches all assets listed in its injected manifest. The old cache version remains intact and continues serving the active page while this happens.

3. **Immediate activation.** The service worker calls `self.skipWaiting()` unconditionally, which bypasses the normal "waiting" state and promotes the new worker to `active` immediately after installation. `clientsClaim()` then makes the new worker the controller for all open tabs.

4. **Cache cleanup.** `cleanupOutdatedCaches()` removes stale Workbox precache entries left by the previous service worker version, keeping storage usage bounded.

5. **Effect on the running page.** Because the new worker activates while the page is open, subsequent navigation requests (clicking a link, reloading) will be served by the new precache. The visible page content itself is not force-reloaded; the update takes full effect on the next navigation or reload.

This is a silent, automatic update cycle. There is no user-visible prompt. The design decision is that correctness (users always run the latest code within one navigation) matters more than explicit opt-in control.

The `registerType: "autoUpdate"` setting in `vite.config.ts` drives steps 1–2. Steps 3–4 are explicit calls in `src/sw.ts`.

---

## Automated tests

The PWA test suite (`e2e/pwa/pwa.spec.ts`, run via `npm -s run test:pwa`) validates the performance and offline guarantees above. It runs against the built app served by `preview:emulators` (`http://localhost:4175`).

### App shell and service worker

| Test | What it verifies |
|---|---|
| `has a valid web app manifest` | Manifest is linked, reachable, and has required fields (`name`, `display: standalone`, icons at 192×192 and 512×512) |
| `icons are accessible` | PWA icon files are reachable and served as `image/png` |
| `has required meta tags` | `viewport`, `theme-color`, and `apple-touch-icon` are present |
| `registers a service worker` | A service worker registration appears within 10 s of page load |
| `service worker controls the page after activation` | `navigator.serviceWorker.ready` resolves with an active worker |
| `is served over a secure context or localhost` | `window.isSecureContext` is true (required for SW and `navigator.storage`) |
| `generated service worker references built app assets` | The compiled `sw.js` contains hashed Vite asset filenames, confirming precache injection succeeded |

### Offline behaviour

| Test | What it verifies |
|---|---|
| `navigateFallback serves index.html for SPA routes` | After the SW is active, navigating to `/login` while offline returns a non-empty page (SPA fallback works) |
| `app shell loads after going offline` | After the SW is active, navigating to `/` while offline returns a non-empty page (precache works) |
| `previously viewed uploaded PNG still renders after offline refresh` | After a user creates a renovation and views the result image online, a full offline page reload still shows the image with the same `src` (localStorage URL + SW image cache both working end-to-end) |

The last test is the critical integration test for the complete offline image pipeline: Firestore cache → URL from localStorage → image bytes from service worker cache.

### Running the tests

```bash
# Start the preview server (builds the app first)
npm -s run services:start preview:emulators

# Run the PWA suite
npm -s run test:pwa
```

The Firebase Emulator Suite must also be running for the `previously viewed uploaded PNG` test (it is skipped automatically if the emulators are not available).
