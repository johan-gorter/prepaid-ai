import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore/lite";
import { ref, watchEffect } from "vue";
import { db } from "../firebase";
import type { Renovation } from "../types";
import { useAuth } from "./useAuth";

export function useRenovations() {
  const renovations = ref<Renovation[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  const { currentUser } = useAuth();

  watchEffect(() => {
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

    getDocs(q)
      .then((snapshot) => {
        renovations.value = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Renovation[];
        loading.value = false;
      })
      .catch((err) => {
        console.error("Error fetching renovations:", err);
        error.value = err.message;
        loading.value = false;
      });
  });

  return { renovations, loading, error };
}
