import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./useAuth";

const THROTTLE_KEY = "prepaid-ai-last-activity-sync";
const THROTTLE_MS = 10 * 60 * 1000; // 10 minutes

export function updateLastActivity() {
  const { currentUser } = useAuth();
  const uid = currentUser.value?.uid;
  if (!uid) return;

  const lastSync = localStorage.getItem(THROTTLE_KEY);
  if (lastSync && Date.now() - Number(lastSync) < THROTTLE_MS) return;

  localStorage.setItem(THROTTLE_KEY, String(Date.now()));
  setDoc(
    doc(db, "users", uid),
    { lastActivity: serverTimestamp() },
    { merge: true },
  );
}

export async function getLastActivity(): Promise<Date | null> {
  const { currentUser } = useAuth();
  const uid = currentUser.value?.uid;
  if (!uid) return null;

  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.data();
  if (!data?.lastActivity) return null;
  return data.lastActivity.toDate();
}
