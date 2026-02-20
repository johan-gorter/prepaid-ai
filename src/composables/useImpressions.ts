import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { ref, watch, type Ref } from "vue";
import { db } from "../firebase";
import type { Impression } from "../types";
import { useAuth } from "./useAuth";

export function useImpressions(renovationId: Ref<string>) {
  const impressions = ref<Impression[]>([]);
  const loading = ref(true);

  const { currentUser } = useAuth();

  watch(
    [() => currentUser.value, renovationId],
    ([user, renoId], _old, onCleanup) => {
      if (!user || !renoId) {
        impressions.value = [];
        loading.value = false;
        return;
      }

      loading.value = true;

      const impressionsRef = collection(
        db,
        "users",
        user.uid,
        "renovations",
        renoId,
        "impressions",
      );
      const q = query(impressionsRef, orderBy("createdAt", "desc"));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        impressions.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Impression[];
        loading.value = false;
      });

      onCleanup(unsubscribe);
    },
    { immediate: true },
  );

  return { impressions, loading };
}
