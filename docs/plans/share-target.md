# PWA Share Target for Image Input

## Status: Planned

## Summary

Register the PWA as an Android share target so users can share images directly
from any app (browser, gallery, messaging) into payasyougo.app — two taps, no
typing, no server function needed.

## Prerequisites

- User must have installed the app as a PWA (Add to Home Screen)

## Implementation

### 1. Manifest `share_target`

Add to `vite.config.ts` PWA manifest:

```json
{
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "files": [
        {
          "name": "image",
          "accept": ["image/png", "image/jpeg", "image/webp", "image/gif"]
        }
      ]
    }
  }
}
```

### 2. Service Worker intercept

In `src/sw.ts`, intercept `POST /share`:

```ts
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === "/share" && event.request.method === "POST") {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData();
        const file = formData.get("image") as File | null;
        if (file) {
          // Store in IDB or cache, then redirect to crop page
        }
        return Response.redirect("/renovation/crop", 303);
      })(),
    );
  }
});
```

### 3. Crop page reads shared image

On mount, check IDB/cache for a shared image and load it into the crop flow.

## References

- https://developer.chrome.com/docs/capabilities/web-apis/web-share-target
- https://web.dev/patterns/advanced-apps/share
