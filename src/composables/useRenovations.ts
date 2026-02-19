import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { ref, watchEffect } from "vue";
import { db } from "../firebase";
import type { Renovation } from "../types";
import { useAuth } from "./useAuth";

export function useRenovations() {
  const renovations = ref<Renovation[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  const { currentUser } = useAuth();

  watchEffect((onCleanup) => {
    if (!currentUser.value) {
      renovations.value = [];
      loading.value = false;
      return;
    }

    loading.value = true;
    error.value = null;

    const renovationsRef = collection(
      db,
      "users",
      currentUser.value.uid,
      "renovations",
    );
    const q = query(renovationsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        renovations.value = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Renovation[];
        loading.value = false;
      },
      (err) => {
        console.error("Error fetching renovations:", err);
        error.value = err.message;
        loading.value = false;
      },
    );

    onCleanup(unsubscribe);
  });

  return { renovations, loading, error };
}
