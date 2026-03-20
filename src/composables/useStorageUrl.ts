import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { storage } from "../firebase";

const resolvedUrlCache = new Map<string, string>();
const inflightUrlCache = new Map<string, Promise<string>>();
const STORAGE_URL_CACHE_KEY = "storage-download-url-cache-v1";

function readPersistedUrlCache(): Record<string, string> {
  if (typeof window === "undefined") return {};

  try {
    const rawValue = window.localStorage.getItem(STORAGE_URL_CACHE_KEY);
    if (!rawValue) return {};

    const parsed = JSON.parse(rawValue) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([path, url]) => typeof path === "string" && typeof url === "string",
      ),
    );
  } catch {
    return {};
  }
}

function writePersistedUrlCache(cacheEntries: Record<string, string>) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      STORAGE_URL_CACHE_KEY,
      JSON.stringify(cacheEntries),
    );
  } catch {
    // Ignore storage quota and serialization failures.
  }
}

function getPersistedUrl(path: string): string | null {
  const persistedEntries = readPersistedUrlCache();
  return persistedEntries[path] ?? null;
}

function persistResolvedUrl(path: string, url: string) {
  const persistedEntries = readPersistedUrlCache();
  persistedEntries[path] = url;
  writePersistedUrlCache(persistedEntries);
}

function getCachedUrl(path: string): string | null {
  const inMemoryUrl = resolvedUrlCache.get(path);
  if (inMemoryUrl) return inMemoryUrl;

  const persistedUrl = getPersistedUrl(path);
  if (persistedUrl) {
    resolvedUrlCache.set(path, persistedUrl);
    return persistedUrl;
  }

  return null;
}

async function fetchStorageUrl(path: string): Promise<string> {
  const cachedUrl = getCachedUrl(path);
  if (cachedUrl) return cachedUrl;

  const inflightRequest = inflightUrlCache.get(path);
  if (inflightRequest) return inflightRequest;

  const request = getDownloadURL(storageRef(storage, path)).then(
    (url) => {
      resolvedUrlCache.set(path, url);
      persistResolvedUrl(path, url);
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
