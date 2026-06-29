/**
 * Loads the signed-in user's recently-used reference images (materials or
 * furniture) for the reference-capture picker grid. A one-shot fetch (not an
 * onSnapshot): the grid is only shown while the reference stage is open, and the
 * list changes only when the user applies a new reference, so a live
 * subscription would be needless overhead.
 */

import { ref } from "vue";
import { useAuth } from "./useAuth";
import {
  listRecentReferenceImages,
  type ReferenceImageEntry,
  type ReferenceKind,
} from "../data/referenceImageRepo";

export function useReferenceImagesList(kind: ReferenceKind, max = 12) {
  const { currentUser } = useAuth();
  const images = ref<ReferenceImageEntry[]>([]);
  const loading = ref(false);

  async function refresh(): Promise<void> {
    const uid = currentUser.value?.uid;
    if (!uid) {
      images.value = [];
      return;
    }
    loading.value = true;
    try {
      images.value = await listRecentReferenceImages(uid, kind, max);
    } catch {
      // Best-effort: an empty grid simply falls back to the upload affordances.
      images.value = [];
    } finally {
      loading.value = false;
    }
  }

  return { images, loading, refresh };
}
