import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { db, storage } from "../firebase";
import type { Share } from "../types";
import { useAuth } from "./useAuth";

function generateShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Return the existing share token for an impression, or create one.
 *
 * Writes a public `shares/{token}` doc containing only the owner uid and a
 * Firebase Storage download URL for the result image. The download URL
 * embeds an unguessable token, which is how anonymous recipients bypass
 * Storage rules without a rules change.
 */
export async function createOrGetShareToken(
  renovationId: string,
  impressionId: string,
): Promise<string> {
  const { currentUser } = useAuth();
  const user = currentUser.value;
  if (!user) throw new Error("Not authenticated");
  const uid = user.uid;

  const impressionRef = doc(
    db,
    "users",
    uid,
    "renovations",
    renovationId,
    "impressions",
    impressionId,
  );
  const snap = await getDoc(impressionRef);
  if (!snap.exists()) throw new Error("Impression not found");
  const data = snap.data();
  const existing = data.shareToken as string | undefined;
  if (existing) return existing;

  const resultImagePath = data.resultImagePath as string | undefined;
  if (!resultImagePath) throw new Error("Impression has no result image");
  const resultImageUrl = await getDownloadURL(
    storageRef(storage, resultImagePath),
  );

  const token = generateShareToken();
  await setDoc(doc(db, "shares", token), {
    ownerUid: uid,
    resultImageUrl,
    createdAt: serverTimestamp(),
  });
  await updateDoc(impressionRef, { shareToken: token });
  return token;
}

export async function fetchShare(token: string): Promise<Share | null> {
  const snap = await getDoc(doc(db, "shares", token));
  return snap.exists() ? (snap.data() as Share) : null;
}

/**
 * Delete the share doc for an impression if one exists.
 *
 * Reads the impression doc to find the token. The caller must be the owner
 * (Firestore rules enforce this). Failures are swallowed by the caller via
 * `Promise.allSettled` because a missing share doc should not block the
 * impression delete.
 */
export async function deleteShareForImpression(
  uid: string,
  renovationId: string,
  impressionId: string,
): Promise<void> {
  const impressionRef = doc(
    db,
    "users",
    uid,
    "renovations",
    renovationId,
    "impressions",
    impressionId,
  );
  const snap = await getDoc(impressionRef);
  if (!snap.exists()) return;
  const token = snap.data().shareToken as string | undefined;
  if (!token) return;
  await deleteDoc(doc(db, "shares", token));
}
