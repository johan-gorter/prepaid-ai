import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { admin, db } from "./admin.js";
import { type TransactionReasonKey } from "./balance.js";
import { FUNCTIONS_REGION } from "./region.js";

/** How long an unaccepted gift stays pending before it auto-reverts. */
const EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Gift credits to another user by email.
 *
 * The sender is debited immediately and the credits are held in escrow on a
 * `creditTransfers` doc until the recipient accepts (credited), declines
 * (refunded), or the 24h window lapses (auto-refunded by
 * `expireCreditTransfers`). Debiting up front is what makes "decline = revert"
 * safe — the sender cannot spend escrowed credits while the gift is pending.
 *
 * Anti-enumeration: the response is identical whether or not the recipient
 * email has an account, so a sender can never probe which emails exist. If the
 * email has no account the credits simply sit in escrow and auto-revert. A
 * notification (and thus delivery) is only created when the email resolves to a
 * real uid.
 */
export const sendCreditTransfer = onCall(
  { region: FUNCTIONS_REGION },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const { recipientEmail, amount } = request.data as {
      recipientEmail: unknown;
      amount: unknown;
    };
    if (typeof recipientEmail !== "string" || !recipientEmail.includes("@")) {
      throw new HttpsError("invalid-argument", "A valid email is required");
    }
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "amount must be a positive integer",
      );
    }

    const recipientEmailLower = recipientEmail.trim().toLowerCase();
    const senderEmail = (request.auth?.token.email ?? "").toLowerCase();
    const senderName =
      (request.auth?.token.name as string | undefined) ||
      senderEmail ||
      "Someone";

    if (senderEmail && senderEmail === recipientEmailLower) {
      throw new HttpsError(
        "invalid-argument",
        "You cannot send credits to yourself",
      );
    }

    // Resolve the recipient WITHOUT revealing the result to the caller. A
    // missing account is not an error here — it just means no notification is
    // delivered and the gift will auto-revert when it expires.
    let recipientUid: string | null = null;
    try {
      const userRecord = await admin.auth().getUserByEmail(recipientEmailLower);
      recipientUid = userRecord.uid;
    } catch {
      recipientUid = null;
    }
    if (recipientUid === callerUid) {
      throw new HttpsError(
        "invalid-argument",
        "You cannot send credits to yourself",
      );
    }

    const senderRef = db.doc(`users/${callerUid}`);
    const senderTxnRef = db
      .collection(`users/${callerUid}/balanceTransactions`)
      .doc();
    const transferRef = db.collection("creditTransfers").doc();
    const notificationRef = recipientUid
      ? db.collection(`users/${recipientUid}/notifications`).doc()
      : null;

    const newBalance = await db.runTransaction(async (txn) => {
      const senderSnap = await txn.get(senderRef);
      const currentBalance: number = senderSnap.data()?.balance ?? 0;
      if (currentBalance < amount) {
        throw new HttpsError(
          "failed-precondition",
          "Insufficient balance for this gift",
        );
      }
      const updatedBalance = currentBalance - amount;

      // Debit the sender (escrow).
      txn.set(senderRef, { balance: updatedBalance }, { merge: true });
      txn.set(senderTxnRef, {
        reasonKey: "credit_transfer_sent" as TransactionReasonKey,
        amount: -amount,
        balanceAfter: updatedBalance,
        createdAt: FieldValue.serverTimestamp(),
        transferId: transferRef.id,
        recipientEmailLower,
      });

      // Escrow record — source of truth for the held credits.
      txn.set(transferRef, {
        senderUid: callerUid,
        senderName,
        senderEmail,
        recipientEmailLower,
        recipientUid,
        amount,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + EXPIRY_MS),
        notificationId: notificationRef?.id ?? null,
      });

      // Deliver the in-app notification only if the recipient exists.
      if (notificationRef) {
        txn.set(notificationRef, {
          type: "credits-gift",
          amount,
          senderName,
          transferId: transferRef.id,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      return updatedBalance;
    });

    // Identical shape regardless of whether the recipient exists.
    return { ok: true, amount, newBalance };
  },
);
