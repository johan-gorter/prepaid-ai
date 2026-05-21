import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin.js";
import { type TransactionReasonKey } from "./balance.js";
import { FUNCTIONS_REGION } from "./region.js";

type Action = "dismiss" | "accept" | "decline";

/**
 * Handle the button a user pressed on one of their notifications.
 *
 * - `message` + `dismiss`: delete the notification.
 * - `credits-gift` + `accept`: credit the recipient, mark the transfer claimed.
 * - `credits-gift` + `decline`: refund the sender, mark the transfer declined.
 *
 * The backing `creditTransfers` doc is the source of truth for the amount and
 * the parties — never the (possibly stale) notification. All work happens in a
 * single transaction and is guarded on `status === "pending"`, so double-clicks
 * and a race with `expireCreditTransfers` can never double-credit or
 * double-refund.
 */
export const notificationResponse = onCall(
  { region: FUNCTIONS_REGION },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const { notificationId, action } = request.data as {
      notificationId: unknown;
      action: unknown;
    };
    if (typeof notificationId !== "string" || !notificationId) {
      throw new HttpsError("invalid-argument", "notificationId is required");
    }
    if (action !== "dismiss" && action !== "accept" && action !== "decline") {
      throw new HttpsError("invalid-argument", "Unknown action");
    }
    const act = action as Action;

    const notifRef = db.doc(
      `users/${callerUid}/notifications/${notificationId}`,
    );

    await db.runTransaction(async (txn) => {
      const notifSnap = await txn.get(notifRef);
      // Already handled (e.g. double-click or expiry beat us here) — no-op.
      if (!notifSnap.exists) return;

      const notif = notifSnap.data() as {
        type: string;
        transferId?: string;
      };

      if (notif.type === "message") {
        txn.delete(notifRef);
        return;
      }

      if (notif.type !== "credits-gift" || !notif.transferId) {
        // Unknown/malformed notification — just clear it.
        txn.delete(notifRef);
        return;
      }

      const transferRef = db.doc(`creditTransfers/${notif.transferId}`);
      const transferSnap = await txn.get(transferRef);

      // Read both balance docs up front (all reads before writes).
      const transfer = transferSnap.exists
        ? (transferSnap.data() as {
            senderUid: string;
            recipientUid: string | null;
            amount: number;
            status: string;
          })
        : null;

      const pending =
        transfer !== null &&
        transfer.status === "pending" &&
        transfer.recipientUid === callerUid;

      if (act === "accept" && pending && transfer) {
        const recipientRef = db.doc(`users/${callerUid}`);
        const recipientSnap = await txn.get(recipientRef);
        const current: number = recipientSnap.data()?.balance ?? 0;
        const updated = current + transfer.amount;

        txn.set(recipientRef, { balance: updated }, { merge: true });
        txn.set(
          db.collection(`users/${callerUid}/balanceTransactions`).doc(),
          {
            reasonKey: "credit_transfer_received" as TransactionReasonKey,
            amount: transfer.amount,
            balanceAfter: updated,
            createdAt: FieldValue.serverTimestamp(),
            transferId: notif.transferId,
            senderUid: transfer.senderUid,
          },
        );
        txn.update(transferRef, {
          status: "claimed",
          resolvedAt: FieldValue.serverTimestamp(),
        });
      } else if (act === "decline" && pending && transfer) {
        const senderRef = db.doc(`users/${transfer.senderUid}`);
        const senderSnap = await txn.get(senderRef);
        const current: number = senderSnap.data()?.balance ?? 0;
        const updated = current + transfer.amount;

        txn.set(senderRef, { balance: updated }, { merge: true });
        txn.set(
          db
            .collection(`users/${transfer.senderUid}/balanceTransactions`)
            .doc(),
          {
            reasonKey: "credit_transfer_refunded" as TransactionReasonKey,
            amount: transfer.amount,
            balanceAfter: updated,
            createdAt: FieldValue.serverTimestamp(),
            transferId: notif.transferId,
            reason: "declined",
          },
        );
        txn.update(transferRef, {
          status: "declined",
          resolvedAt: FieldValue.serverTimestamp(),
        });
      }

      // Whatever the outcome, the notification is consumed.
      txn.delete(notifRef);
    });

    return { ok: true };
  },
);
