import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { storage } from "../firebase";
import { idbGet, idbSet } from "./useIdbStorage";

const resolvedUrlCache = new Map<string, string>();
const inflightUrlCache = new Map<string, Promise<string>>();
const STORAGE_URL_CACHE_KEY = "storageDownloadUrlCache";

let persistedCachePromise: Promise<Record<string, string>> | null = null;

function loadPersistedCache(): Promise<Record<string, string>> {
  if (persistedCachePromise) return persistedCachePromise;
  persistedCachePromise = idbGet<Record<string, string>>(
    STORAGE_URL_CACHE_KEY,
  ).then((value) => {
    const entries = value ?? {};
    for (const [path, url] of Object.entries(entries)) {
      if (typeof path === "string" && typeof url === "string") {
        resolvedUrlCache.set(path, url);
      }
    }
    return entries;
  });
  return persistedCachePromise;
}

// Kick off the persisted-cache load eagerly so the in-memory cache is hot
// by the time the first <StorageImage> mounts. Failures are swallowed —
// missing cache just means we'll re-resolve URLs on demand.
void loadPersistedCache().catch(() => {});

async function persistResolvedUrl(path: string, url: string) {
  try {
    const entries = await loadPersistedCache();
    entries[path] = url;
    await idbSet(STORAGE_URL_CACHE_KEY, entries);
  } catch {
    // ignore: persistence is a best-effort optimisation
  }
}

function getCachedUrl(path: string): string | null {
  return resolvedUrlCache.get(path) ?? null;
}

async function fetchStorageUrl(path: string): Promise<string> {
  const cachedUrl = getCachedUrl(path);
  if (cachedUrl) return cachedUrl;

  const inflightRequest = inflightUrlCache.get(path);
  if (inflightRequest) return inflightRequest;

  const request = getDownloadURL(storageRef(storage, path)).then(
    (url) => {
      resolvedUrlCache.set(path, url);
      void persistResolvedUrl(path, url);
      inflightUrlCache.delete(path);
      return url;
    },
    (error: unknown) => {
      inflightUrlCache.delete(path);
      throw error;
    },
  );

  inflightUrlCache.set(path, request);
  return request;
}

export async function resolveStorageUrl(path: string): Promise<string> {
  return fetchStorageUrl(path);
}

export function useStorageUrl(
  pathSource: MaybeRefOrGetter<string | null | undefined>,
  fallbackUrlSource?: MaybeRefOrGetter<string | null | undefined>,
) {
  const url = ref<string | null>(toValue(fallbackUrlSource) ?? null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  watch(
    [() => toValue(pathSource), () => toValue(fallbackUrlSource)],
    async ([path, fallbackUrl], _oldValue, onCleanup) => {
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      error.value = null;

      if (!path) {
        url.value = fallbackUrl ?? null;
        loading.value = false;
        return;
      }

      // Wait for the persisted cache to load before deciding whether we
      // already know the URL — otherwise a cold load would always trigger
      // a network round-trip even when the path is cached on disk.
      await loadPersistedCache();
      if (cancelled) return;

      const cachedUrl = getCachedUrl(path);
      if (cachedUrl) {
        url.value = cachedUrl;
        loading.value = false;
        return;
      }

      loading.value = true;

      try {
        const resolvedUrl = await fetchStorageUrl(path);
        if (!cancelled) {
          url.value = resolvedUrl;
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          url.value = fallbackUrl ?? null;
          error.value =
            loadError instanceof Error
              ? loadError.message
              : "Failed to load image.";
        }
      } finally {
        if (!cancelled) {
          loading.value = false;
        }
      }
    },
    { immediate: true },
  );

  return { url, loading, error };
}
