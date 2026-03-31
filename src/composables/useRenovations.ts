import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { ref, watchEffect } from "vue";
import { db, storage } from "../firebase";
import type { Impression, Renovation } from "../types";
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
    const q = query(renovationsRef, orderBy("updatedAt", "desc"));

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

  async function createRenovation(data: {
    originalImagePath: string;
  }): Promise<string> {
    if (!currentUser.value) throw new Error("Not authenticated");
    const renovationsRef = collection(
      db,
      "users",
      currentUser.value.uid,
      "renovations",
    );
    const docRef = await addDoc(renovationsRef, {
      originalImagePath: data.originalImagePath,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  }

  async function createImpression(
    renovationId: string,
    data: {
      sourceImagePath: string;
      prompt: string;
      maskImagePath?: string;
      compositeImagePath?: string;
    },
  ): Promise<string> {
    if (!currentUser.value) throw new Error("Not authenticated");
    const uid = currentUser.value.uid;
    const impressionsRef = collection(
      db,
      "users",
      uid,
      "renovations",
      renovationId,
      "impressions",
    );
    const docData: Record<string, unknown> = {
      sourceImagePath: data.sourceImagePath,
      prompt: data.prompt,
      status: "pending",
      createdAt: serverTimestamp(),
    };
    if (data.maskImagePath) {
      docData.maskImagePath = data.maskImagePath;
    }
    if (data.compositeImagePath) {
      docData.compositeImagePath = data.compositeImagePath;
    }
    const docRef = await addDoc(impressionsRef, docData);

    // Auto-star: if renovation has no afterImpressionId, set it
    const renovationDocRef = doc(db, "users", uid, "renovations", renovationId);
    const renovationDoc = await getDoc(renovationDocRef);
    if (renovationDoc.exists()) {
      const renoData = renovationDoc.data();
      if (!renoData.afterImpressionId) {
        await updateDoc(renovationDocRef, {
          afterImpressionId: docRef.id,
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(renovationDocRef, {
          updatedAt: serverTimestamp(),
        });
      }
    }

    return docRef.id;
  }

  async function setAfterImpression(
    renovationId: string,
    impressionId: string,
  ): Promise<void> {
    if (!currentUser.value) throw new Error("Not authenticated");
    const uid = currentUser.value.uid;
    await updateDoc(
      doc(db, "users", uid, "renovations", renovationId),
      { afterImpressionId: impressionId, updatedAt: serverTimestamp() },
    );
  }

  async function deleteImpression(
    renovationId: string,
    impressionId: string,
  ): Promise<void> {
    if (!currentUser.value) throw new Error("Not authenticated");
    const uid = currentUser.value.uid;

    // Read impression doc to get storage paths
    const impressionDocRef = doc(
      db,
      "users",
      uid,
      "renovations",
      renovationId,
      "impressions",
      impressionId,
    );
    const impressionSnap = await getDoc(impressionDocRef);
    if (impressionSnap.exists()) {
      const data = impressionSnap.data() as Impression;
      // Delete storage files (ignore errors for missing files)
      const pathsToDelete = [
        data.sourceImagePath,
        data.resultImagePath,
        (data as unknown as Record<string, unknown>).compositeImagePath as string | undefined,
      ].filter(Boolean) as string[];
      await Promise.allSettled(
        pathsToDelete.map((p) => deleteObject(storageRef(storage, p))),
      );
    }

    // Delete impression doc
    await deleteDoc(impressionDocRef);

    // If this was the starred impression, auto-star the most recent completed one
    const renovationDocRef = doc(db, "users", uid, "renovations", renovationId);
    const renovationSnap = await getDoc(renovationDocRef);
    if (renovationSnap.exists()) {
      const renoData = renovationSnap.data();
      if (renoData.afterImpressionId === impressionId) {
        // Find most recent completed impression
        const impressionsRef = collection(
          db,
          "users",
          uid,
          "renovations",
          renovationId,
          "impressions",
        );
        const q = query(impressionsRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        const mostRecent = snap.docs.find(
          (d) => d.data().status === "completed" && d.id !== impressionId,
        );
        await updateDoc(renovationDocRef, {
          afterImpressionId: mostRecent?.id ?? null,
          updatedAt: serverTimestamp(),
        });
      }
    }
  }

  async function deleteRenovation(renovationId: string): Promise<void> {
    if (!currentUser.value) throw new Error("Not authenticated");
    const uid = currentUser.value.uid;

    // Delete all impressions and their storage files
    const impressionsRef = collection(
      db,
      "users",
      uid,
      "renovations",
      renovationId,
      "impressions",
    );
    const impressionsSnap = await getDocs(impressionsRef);
    for (const impressionDoc of impressionsSnap.docs) {
      const data = impressionDoc.data() as Impression;
      const pathsToDelete = [
        data.sourceImagePath,
        data.resultImagePath,
        (data as unknown as Record<string, unknown>).compositeImagePath as string | undefined,
      ].filter(Boolean) as string[];
      await Promise.allSettled(
        pathsToDelete.map((p) => deleteObject(storageRef(storage, p))),
      );
      await deleteDoc(impressionDoc.ref);
    }

    // Delete original image
    const renovationDocRef = doc(db, "users", uid, "renovations", renovationId);
    const renovationSnap = await getDoc(renovationDocRef);
    if (renovationSnap.exists()) {
      const renoData = renovationSnap.data();
      if (renoData.originalImagePath) {
        await deleteObject(
          storageRef(storage, renoData.originalImagePath),
        ).catch(() => {});
      }
    }

    // Delete renovation document
    await deleteDoc(renovationDocRef);
  }

  return {
    renovations,
    loading,
    error,
    createRenovation,
    createImpression,
    setAfterImpression,
    deleteImpression,
    deleteRenovation,
  };
}
