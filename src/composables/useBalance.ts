import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { onUnmounted, ref, watch } from "vue";
import { db } from "../firebase";
import type { BalanceTransaction } from "../types";
import { useAuth } from "./useAuth";

export function useBalance() {
  const { currentUser } = useAuth();
  const balance = ref<number>(0);
  const transactions = ref<BalanceTransaction[]>([]);
  const loading = ref(true);
  /**
   * `true` after the Firestore listener for the current uid has emitted at
   * least one snapshot. Distinct from `!loading`, which also goes false
   * when there's no signed-in user.
   */
  const balanceLoaded = ref(false);

  let unsubBalance: (() => void) | null = null;
  let unsubTxns: (() => void) | null = null;

  function cleanup() {
    unsubBalance?.();
    unsubTxns?.();
    unsubBalance = null;
    unsubTxns = null;
  }

  /**
   * Resolve once the balance has been read at least once for the current
   * signed-in user, so callers can make decisions ("do I have enough
   * credits?") without races against the initial Firestore snapshot.
   *
   * Resolves immediately when no user is signed in — a null `currentUser`
   * is itself enough information for callers to act on.
   */
  async function waitForLoad(): Promise<void> {
    if (!currentUser.value || balanceLoaded.value) return;
    await new Promise<void>((resolve) => {
      const stop = watch([balanceLoaded, () => currentUser.value], () => {
        if (!currentUser.value || balanceLoaded.value) {
          stop();
          resolve();
        }
      });
    });
  }

  watch(
    () => currentUser.value?.uid,
    (uid) => {
      cleanup();
      balance.value = 0;
      transactions.value = [];
      loading.value = true;
      balanceLoaded.value = false;

      if (!uid) {
        loading.value = false;
        return;
      }

      // Listen to user profile for balance
      const userRef = doc(db, "users", uid);
      unsubBalance = onSnapshot(userRef, (snap) => {
        balance.value = snap.data()?.balance ?? 0;
        loading.value = false;
        // Only mark balance as known-loaded once the snapshot is server-
        // authoritative. The first cached snapshot can return the doc
        // without its server-managed fields (e.g. `balance`) when the
        // client has just performed a `setDoc({...}, {merge: true})`
        // that hasn't been acknowledged yet — using that view to gate
        // "you must buy credits" decisions would falsely send funded
        // users to the purchase page.
        if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) {
          balanceLoaded.value = true;
        }
      });

      // Listen to recent balance transactions
      const txnQuery = query(
        collection(db, `users/${uid}/balanceTransactions`),
        orderBy("createdAt", "desc"),
        limit(50),
      );
      unsubTxns = onSnapshot(txnQuery, (snap) => {
        transactions.value = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as BalanceTransaction[];
      });
    },
    { immediate: true },
  );

  onUnmounted(cleanup);

  return { balance, transactions, loading, waitForLoad };
}
