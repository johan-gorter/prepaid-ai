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
   * least one snapshot whose state we can trust (no in-flight local writes).
   * Distinct from `!loading`, which also goes false when there's no
   * signed-in user.
   */
  const balanceLoaded = ref(false);
  const unmounted = ref(false);

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
   * Resolves immediately when no user is signed in (null `currentUser`
   * is itself enough information for callers to act on) and when the
   * component has unmounted (so an aborted Send/Generate doesn't leak
   * a watcher and Promise frame for the lifetime of the session).
   */
  async function waitForLoad(): Promise<void> {
    if (!currentUser.value || balanceLoaded.value || unmounted.value) return;
    await new Promise<void>((resolve) => {
      const stop = watch(
        [balanceLoaded, () => currentUser.value, unmounted],
        () => {
          if (
            unmounted.value ||
            !currentUser.value ||
            balanceLoaded.value
          ) {
            stop();
            resolve();
          }
        },
      );
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

      // Listen to user profile for balance.
      //
      // `includeMetadataChanges: true` is load-bearing: several composables
      // (`useAuth`'s sign-in upsert, `useLastActivity`, `useLocale`) write to
      // this same user doc. If this listener attaches while such a write is
      // still unacknowledged, the first snapshot has `hasPendingWrites: true`
      // — and the acknowledgement itself changes only *metadata*, which a
      // default listener never reports. `balanceLoaded` would then stay false
      // until the next data change, deadlocking `waitForLoad()` and leaving
      // the Generate / Send buttons silently inert.
      const userRef = doc(db, "users", uid);
      unsubBalance = onSnapshot(
        userRef,
        { includeMetadataChanges: true },
        (snap) => {
          balance.value = snap.data()?.balance ?? 0;
          loading.value = false;
          // Only mark balance as known-loaded once any in-flight local
          // writes to this doc have been acknowledged. Without that guard
          // the cached view of a freshly `setDoc({...}, {merge: true})`-ed
          // user can briefly omit server-managed fields like `balance`,
          // and we'd send a funded user to the purchase page.
          //
          // We deliberately do NOT also exclude `fromCache` — when the
          // device is offline the cache is the best estimate we have, and
          // gating on a server snapshot would hang `waitForLoad()` forever
          // and leave the Send / Generate buttons silently inert.
          if (!snap.metadata.hasPendingWrites) {
            balanceLoaded.value = true;
          }
        },
      );

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

  onUnmounted(() => {
    unmounted.value = true;
    cleanup();
  });

  return { balance, transactions, loading, waitForLoad };
}
