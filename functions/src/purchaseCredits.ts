import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin.js";
import { type TransactionReasonKey } from "./balance.js";

/**
 * Credit a user's balance for a successful purchase.
 *
 * In the emulator this is the dummy implementation that always succeeds —
 * the client calls it directly after returning from the (skipped) payment
 * step. In production this function only runs when triggered by the Stripe
 * webhook, which lives outside the user's auth session, so direct callable
 * invocations are rejected.
 */
export const purchaseCredits = onCall(
  { region: "europe-west1" },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    if (process.env.FUNCTIONS_EMULATOR !== "true") {
      throw new HttpsError(
        "permission-denied",
        "Direct purchase calls are only allowed in emulator mode",
      );
    }

    const { amount } = request.data as { amount: unknown };
    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount < 10 ||
      amount > 10000
    ) {
      throw new HttpsError(
        "invalid-argument",
        "amount must be an integer between 10 and 10000",
      );
    }

    const userRef = db.doc(`users/${callerUid}`);
    const txnCollection = db.collection(
      `users/${callerUid}/balanceTransactions`,
    );

    const newBalance = await db.runTransaction(async (txn) => {
      const snap = await txn.get(userRef);
      const currentBalance: number = snap.data()?.balance ?? 0;
      const updatedBalance = currentBalance + amount;

      txn.set(txnCollection.doc(), {
        reasonKey: "credit_purchase" as TransactionReasonKey,
        amount,
        balanceAfter: updatedBalance,
        createdAt: FieldValue.serverTimestamp(),
      });
      txn.update(userRef, { balance: updatedBalance });

      return updatedBalance;
    });

    return { amount, newBalance };
  },
);
