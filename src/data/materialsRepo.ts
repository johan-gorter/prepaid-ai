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
 * The per-user registry of material reference photos used by the "Apply
 * material" flow. Each applied material is remembered so the user can re-pick it
 * (2 taps to a generation) instead of re-uploading.
 *
 * Dedupe is by content hash: the Firestore doc id and the Storage object name
 * are both the SHA-256 of the image bytes, so applying the same material twice
 * reuses the one Storage object and the one registry entry. Re-applying bumps
 * `createdAt` so recently-used materials sort to the front of the picker grid.
 *
 * Like renovations, this lives under `users/{uid}` and is server-side per-user,
 * so it persists across devices and survives sign-out (unlike the IndexedDB
 * drafts, which are wiped on sign-out).
 */

export interface MaterialEntry {
  /** Content hash — the Firestore doc id and Storage object name. */
  id: string;
  /** Firebase Storage path of the material image. */
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
 * Resolve a material blob to a Storage path, creating the registry entry and
 * uploading the bytes only when this material has not been seen before. Always
 * refreshes `createdAt` so re-used materials float to the top of the grid.
 * Returns the Storage path to persist on the impression.
 */
export async function getOrCreateMaterial(
  uid: string,
  blob: Blob,
): Promise<string> {
  const hash = await hashBlob(blob);
  const imagePath = `users/${uid}/materials/${hash}.webp`;
  const docRef = doc(db, "users", uid, "materials", hash);

  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    await uploadBytes(storageRef(storage, imagePath), blob);
  }
  // Upsert (also bumps recency for an existing material).
  await setDoc(docRef, { imagePath, createdAt: serverTimestamp() });
  return imagePath;
}

/** The user's most recently used materials, newest first. */
export async function listRecentMaterials(
  uid: string,
  max = 12,
): Promise<MaterialEntry[]> {
  const q = query(
    collection(db, "users", uid, "materials"),
    orderBy("createdAt", "desc"),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    imagePath: d.data().imagePath as string,
  }));
}
