import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";

/**
 * Per-user registries of reusable reference photos that the user supplies as a
 * second image for an edit: the **material** to resurface a marked area with
 * ("Apply material") and the **furniture** to place into a marked area
 * ("Add furniture"). Both flows are identical apart from the prompt, so they
 * share this storage layer; only the registry kind (and therefore the Firestore
 * subcollection + Storage folder) differ, which keeps the two funnels separate.
 *
 * Each applied reference is remembered so the user can re-pick it (2 taps to a
 * generation) instead of re-uploading. Dedupe is by content hash: the Firestore
 * doc id and the Storage object name are both the SHA-256 of the image bytes, so
 * applying the same reference twice reuses the one Storage object and the one
 * registry entry. Re-applying bumps `createdAt` so recently-used references sort
 * to the front of the picker grid.
 *
 * Like renovations, this lives under `users/{uid}` and is server-side per-user,
 * so it persists across devices and survives sign-out (unlike the IndexedDB
 * drafts, which are wiped on sign-out).
 */

/** The kinds of reference image a user can supply as the second edit image. */
export type ReferenceKind = "material" | "furniture";

/** Firestore subcollection + Storage folder name for each kind. */
const COLLECTION: Record<ReferenceKind, string> = {
  material: "materials",
  furniture: "furniture",
};

export interface ReferenceImageEntry {
  /** Content hash — the Firestore doc id and Storage object name. */
  id: string;
  /** Firebase Storage path of the reference image. */
  imagePath: string;
}

/** SHA-256 hex digest of a Blob's bytes. */
export async function hashBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Resolve a reference blob to a Storage path, creating the registry entry and
 * uploading the bytes only when this reference has not been seen before. Always
 * refreshes `createdAt` so re-used references float to the top of the grid.
 * Returns the Storage path to persist on the impression.
 */
export async function getOrCreateReferenceImage(
  uid: string,
  kind: ReferenceKind,
  blob: Blob,
): Promise<string> {
  const collectionName = COLLECTION[kind];
  const hash = await hashBlob(blob);
  const imagePath = `users/${uid}/${collectionName}/${hash}.webp`;
  const docRef = doc(db, "users", uid, collectionName, hash);

  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    await uploadBytes(storageRef(storage, imagePath), blob);
  }
  // Upsert (also bumps recency for an existing reference).
  await setDoc(docRef, { imagePath, createdAt: serverTimestamp() });
  return imagePath;
}

/** The user's most recently used references of a kind, newest first. */
export async function listRecentReferenceImages(
  uid: string,
  kind: ReferenceKind,
  max = 12,
): Promise<ReferenceImageEntry[]> {
  const q = query(
    collection(db, "users", uid, COLLECTION[kind]),
    orderBy("createdAt", "desc"),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    imagePath: d.data().imagePath as string,
  }));
}
