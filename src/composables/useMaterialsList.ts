/**
 * Loads the signed-in user's recently-used materials for the apply-material
 * picker grid. A one-shot fetch (not an onSnapshot): the grid is only shown
 * while the material stage is open, and the list changes only when the user
 * applies a new material, so a live subscription would be needless overhead.
 */

import { ref } from "vue";
import { useAuth } from "./useAuth";
import { listRecentMaterials, type MaterialEntry } from "../data/materialsRepo";

export function useMaterialsList(max = 12) {
  const { currentUser } = useAuth();
  const materials = ref<MaterialEntry[]>([]);
  const loading = ref(false);

  async function refresh(): Promise<void> {
    const uid = currentUser.value?.uid;
    if (!uid) {
      materials.value = [];
      return;
    }
    loading.value = true;
    try {
      materials.value = await listRecentMaterials(uid, max);
    } catch {
      // Best-effort: an empty grid simply falls back to the upload affordances.
      materials.value = [];
    } finally {
      loading.value = false;
    }
  }

  return { materials, loading, refresh };
}
