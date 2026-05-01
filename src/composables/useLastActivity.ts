import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { idbGet, idbSet } from "./useIdbStorage";
import { useAuth } from "./useAuth";

const THROTTLE_KEY = "lastActivitySync";
const THROTTLE_MS = 10 * 60 * 1000; // 10 minutes

export async function updateLastActivity() {
  const { currentUser } = useAuth();
  const uid = currentUser.value?.uid;
  if (!uid) return;

  const lastSync = await idbGet<number>(THROTTLE_KEY);
  if (lastSync && Date.now() - lastSync < THROTTLE_MS) return;

  await idbSet(THROTTLE_KEY, Date.now());
  void setDoc(
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
