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

  let unsubBalance: (() => void) | null = null;
  let unsubTxns: (() => void) | null = null;

  function cleanup() {
    unsubBalance?.();
    unsubTxns?.();
    unsubBalance = null;
    unsubTxns = null;
  }

  watch(
    () => currentUser.value?.uid,
    (uid) => {
      cleanup();
      balance.value = 0;
      transactions.value = [];
      loading.value = true;

      if (!uid) {
        loading.value = false;
        return;
      }

      // Listen to user profile for balance
      const userRef = doc(db, "users", uid);
      unsubBalance = onSnapshot(userRef, (snap) => {
        balance.value = snap.data()?.balance ?? 0;
        loading.value = false;
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

  return { balance, transactions, loading };
}
