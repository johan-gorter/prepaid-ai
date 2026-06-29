import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { db, storage } from "../firebase";
import type { RenovationAction } from "../credits";
import type { Impression } from "../types";
import { deleteShareForImpression } from "../composables/useShare";

/**
 * Plain Firestore/Storage operations for renovations and impressions.
 *
 * These are deliberately ref-free and listener-free: each takes the caller's
 * `uid` and resolves a promise. The live collection subscription lives
 * separately in `useRenovationsList.ts`, so callers that only mutate data
 * (the wizard, the detail page) don't open an `onSnapshot` on the whole
 * renovations collection just to call a CRUD helper.
 */

export async function createRenovation(
  uid: string,
  data: { originalImagePath: string },
): Promise<string> {
  const renovationsRef = collection(db, "users", uid, "renovations");
  const docRef = await addDoc(renovationsRef, {
    originalImagePath: data.originalImagePath,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function createImpression(
  uid: string,
  renovationId: string,
  data: {
    sourceImagePath: string;
    prompt: string;
    maskImagePath?: string;
    compositeImagePath?: string;
    paintColor?: string;
    referenceImagePath?: string;
    mode?: string;
    action?: RenovationAction;
  },
): Promise<string> {
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
  if (data.paintColor) {
    docData.paintColor = data.paintColor;
  }
  if (data.referenceImagePath) {
    docData.referenceImagePath = data.referenceImagePath;
  }
  if (data.mode) {
    docData.mode = data.mode;
  }
  // Persist the action so the Cloud Function charges the per-action price
  // (remove = 5, colour change = 10, free edit = 10) rather than a flat rate.
  if (data.action) {
    docData.action = data.action;
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

export async function setAfterImpression(
  uid: string,
  renovationId: string,
  impressionId: string,
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "renovations", renovationId), {
    afterImpressionId: impressionId,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteImpression(
  uid: string,
  renovationId: string,
  impressionId: string,
): Promise<void> {
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
      (data as unknown as Record<string, unknown>).compositeImagePath as
        | string
        | undefined,
    ].filter(Boolean) as string[];
    await Promise.allSettled(
      pathsToDelete.map((p) => deleteObject(storageRef(storage, p))),
    );
  }

  // Delete public share doc (if any) before the impression doc — the share
  // delete reads `shareToken` off the impression. Tolerate failures so a
  // missing or already-deleted share doesn't block impression cleanup.
  await Promise.allSettled([
    deleteShareForImpression(uid, renovationId, impressionId),
  ]);

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

export async function deleteRenovation(
  uid: string,
  renovationId: string,
): Promise<void> {
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
      (data as unknown as Record<string, unknown>).compositeImagePath as
        | string
        | undefined,
    ].filter(Boolean) as string[];
    await Promise.allSettled(
      pathsToDelete.map((p) => deleteObject(storageRef(storage, p))),
    );
    await Promise.allSettled([
      deleteShareForImpression(uid, renovationId, impressionDoc.id),
    ]);
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
