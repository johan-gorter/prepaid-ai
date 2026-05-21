import { FieldValue } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "./admin.js";
import { type TransactionReasonKey } from "./balance.js";
import { FUNCTIONS_REGION } from "./region.js";

/**
 * Auto-revert credit gifts that were never accepted or declined within their
 * window. Runs hourly. We query only `status == "pending"` (a small set —
 * unacted gifts) and check expiry in code, which avoids needing a composite
 * index on (status, expiresAt).
 *
 * Each refund runs in its own transaction guarded on `status === "pending"`,
 * so it never collides with a recipient accepting/declining at the same moment
 * (`notificationResponse` flips the same field under the same guard).
 */
export const expireCreditTransfers = onSchedule(
  { schedule: "every 60 minutes", region: FUNCTIONS_REGION },
  async () => {
    const now = Date.now();
    const pending = await db
      .collection("creditTransfers")
      .where("status", "==", "pending")
      .limit(500)
      .get();

    for (const docSnap of pending.docs) {
      const data = docSnap.data() as {
        expiresAt?: { toMillis: () => number };
      };
      if (!data.expiresAt || data.expiresAt.toMillis() > now) continue;

      const transferRef = docSnap.ref;
      try {
        await db.runTransaction(async (txn) => {
          const snap = await txn.get(transferRef);
          if (!snap.exists) return;
          const t = snap.data() as {
            senderUid: string;
            recipientUid: string | null;
            amount: number;
            status: string;
            notificationId: string | null;
            expiresAt?: { toMillis: () => number };
          };
          if (t.status !== "pending") return;
          if (!t.expiresAt || t.expiresAt.toMillis() > now) return;

          const senderRef = db.doc(`users/${t.senderUid}`);
          const senderSnap = await txn.get(senderRef);
          const current: number = senderSnap.data()?.balance ?? 0;
          const updated = current + t.amount;

          txn.set(senderRef, { balance: updated }, { merge: true });
          txn.set(
            db.collection(`users/${t.senderUid}/balanceTransactions`).doc(),
            {
              reasonKey: "credit_transfer_refunded" as TransactionReasonKey,
              amount: t.amount,
              balanceAfter: updated,
              createdAt: FieldValue.serverTimestamp(),
              transferId: transferRef.id,
              reason: "expired",
            },
          );
          txn.update(transferRef, {
            status: "expired",
            resolvedAt: FieldValue.serverTimestamp(),
          });

          // Drop the now-stale notification if it was delivered.
          if (t.recipientUid && t.notificationId) {
            txn.delete(
              db.doc(
                `users/${t.recipientUid}/notifications/${t.notificationId}`,
              ),
            );
          }
        });
      } catch (err) {
        // Log and continue — one bad transfer shouldn't block the rest.
        console.error(`expireCreditTransfers: ${transferRef.id} failed`, err);
      }
    }
  },
);
