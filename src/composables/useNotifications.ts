import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { computed, onUnmounted, ref, watch } from "vue";
import { db, functions } from "../firebase";
import type { AppNotification } from "../types";
import { useAuth } from "./useAuth";

export type NotificationAction = "dismiss" | "accept" | "decline";

const respondCallable = httpsCallable<
  { notificationId: string; action: NotificationAction },
  { ok: true }
>(functions, "notificationResponse");

/**
 * Live view of the signed-in user's notifications, oldest first. The app shows
 * `current` (the oldest unhandled one) as a modal popup. Responses go through
 * the `notificationResponse` callable, which performs all the credit moves;
 * the deleted notification then disappears from this list via the snapshot.
 */
export function useNotifications() {
  const { currentUser } = useAuth();
  const notifications = ref<AppNotification[]>([]);
  /** The notification currently shown as a popup (oldest pending). */
  const current = computed<AppNotification | null>(
    () => notifications.value[0] ?? null,
  );
  const responding = ref(false);

  let unsub: (() => void) | null = null;

  function cleanup() {
    unsub?.();
    unsub = null;
  }

  watch(
    () => currentUser.value?.uid,
    (uid) => {
      cleanup();
      notifications.value = [];
      if (!uid) return;

      const q = query(
        collection(db, `users/${uid}/notifications`),
        orderBy("createdAt", "asc"),
      );
      unsub = onSnapshot(q, (snap) => {
        notifications.value = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as AppNotification[];
      });
    },
    { immediate: true },
  );

  onUnmounted(cleanup);

  async function respond(notificationId: string, action: NotificationAction) {
    if (responding.value) return;
    responding.value = true;
    try {
      await respondCallable({ notificationId, action });
    } finally {
      responding.value = false;
    }
  }

  return { notifications, current, responding, respond };
}
