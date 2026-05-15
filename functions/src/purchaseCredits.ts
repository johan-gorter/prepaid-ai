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
 *
 * Idempotency: callers MUST supply a stable `idempotencyKey` per checkout
 * attempt. We name the resulting balance-transaction doc after that key,
 * so a retry that lands after the first attempt already committed
 * short-circuits to the existing balance instead of double-crediting.
 */
export const purchaseCredits = onCall(
  { region: process.env.FUNCTIONS_REGION ?? "europe-west4" },
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

    const { amount, idempotencyKey } = request.data as {
      amount: unknown;
      idempotencyKey: unknown;
    };
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
    if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8) {
      throw new HttpsError(
        "invalid-argument",
        "idempotencyKey must be a non-empty string",
      );
    }

    const userRef = db.doc(`users/${callerUid}`);
    const txnRef = db.doc(
      `users/${callerUid}/balanceTransactions/purchase_${idempotencyKey}`,
    );

    const newBalance = await db.runTransaction(async (txn) => {
      const existingTxn = await txn.get(txnRef);
      if (existingTxn.exists) {
        // The same idempotency key already produced a credit — return the
        // current balance instead of double-applying.
        const userSnap = await txn.get(userRef);
        return (userSnap.data()?.balance ?? 0) as number;
      }

      const userSnap = await txn.get(userRef);
      const currentBalance: number = userSnap.data()?.balance ?? 0;
      const updatedBalance = currentBalance + amount;

      txn.set(txnRef, {
        reasonKey: "credit_purchase" as TransactionReasonKey,
        amount,
        balanceAfter: updatedBalance,
        createdAt: FieldValue.serverTimestamp(),
        idempotencyKey,
      });
      // Use set+merge so the very first purchase from a brand-new user
      // (whose user doc may not have been created yet by the client-side
      // setDoc in useAuth) doesn't fail with NOT_FOUND.
      txn.set(userRef, { balance: updatedBalance }, { merge: true });

      return updatedBalance;
    });

    return { amount, newBalance };
  },
);
