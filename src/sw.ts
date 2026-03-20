/// <reference lib="WebWorker" />

import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope;

const firebaseImageCacheName = "firebase-storage-images-v1";

function isFirebaseStorageObjectUrl(url: URL) {
  const isProductionStorage = url.hostname === "firebasestorage.googleapis.com";
  const isLocalStorageEmulator =
    url.hostname === "127.0.0.1" || url.hostname === "localhost";

  return (
    (isProductionStorage || isLocalStorageEmulator) &&
    url.pathname.startsWith("/v0/b/") &&
    url.pathname.includes("/o/")
  );
}

function buildCacheKey(url: URL) {
  return new Request(`${url.origin}${url.pathname}`, {
    method: "GET",
  });
}

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

registerRoute(
  ({ url, request }) =>
    request.method === "GET" &&
    request.destination === "image" &&
    isFirebaseStorageObjectUrl(url),
  async ({ request, url }) => {
    const cache = await caches.open(firebaseImageCacheName);
    const cacheKey = buildCacheKey(url);
    const cachedResponse = await cache.match(cacheKey);

    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(cacheKey, networkResponse.clone());
    }

    return networkResponse;
  },
);

self.skipWaiting();
clientsClaim();

export {};
