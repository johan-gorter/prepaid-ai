import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin.js";

// ---------------------------------------------------------------------------
// Balance transaction reason keys (translated client-side)
// ---------------------------------------------------------------------------
export type TransactionReasonKey =
  | "image_generation"
  | "chat_message"
  | "credit_purchase"
  | "admin_adjustment";

/**
 * Deduct credits from a user's balance inside a Firestore transaction.
 * Creates a document in `users/{uid}/balanceTransactions` and decrements
 * `users/{uid}.balance`.
 *
 * Returns the new balance, or throws if insufficient funds.
 */
export async function deductCredits(
  userId: string,
  credits: number,
  reasonKey: TransactionReasonKey,
  metadata?: Record<string, unknown>,
): Promise<number> {
  const userRef = db.doc(`users/${userId}`);
  const txnCollection = db.collection(`users/${userId}/balanceTransactions`);

  return db.runTransaction(async (txn) => {
    const userSnap = await txn.get(userRef);
    const currentBalance: number = userSnap.data()?.balance ?? 0;
    const newBalance = currentBalance - credits;

    if (newBalance < 0) {
      throw new Error(
        `Insufficient balance: need ${credits}, have ${currentBalance}`,
      );
    }

    const txnRef = txnCollection.doc();
    txn.set(txnRef, {
      reasonKey,
      amount: -credits,
      balanceAfter: newBalance,
      createdAt: FieldValue.serverTimestamp(),
      ...metadata,
    });
    txn.update(userRef, { balance: newBalance });

    return newBalance;
  });
}
