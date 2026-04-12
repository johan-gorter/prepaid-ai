import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { admin, db } from "./admin.js";
import { type TransactionReasonKey } from "./balance.js";
import { getAdminUids } from "./utils.js";

export const addCredits = onCall(
  { region: "europe-west1" },
  async (request) => {
    // 1. Must be authenticated
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    // 2. Must be an admin
    const adminUids = getAdminUids();
    if (!adminUids.includes(callerUid)) {
      throw new HttpsError(
        "permission-denied",
        "Only administrators can add credits",
      );
    }

    // 3. Validate input
    const { email, amount } = request.data as {
      email: unknown;
      amount: unknown;
    };
    if (typeof email !== "string" || !email.includes("@")) {
      throw new HttpsError("invalid-argument", "A valid email is required");
    }
    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      throw new HttpsError(
        "invalid-argument",
        "amount must be a positive integer",
      );
    }

    // 4. Look up user by email
    let targetUid: string;
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      targetUid = userRecord.uid;
    } catch {
      throw new HttpsError("not-found", `No user found with email ${email}`);
    }

    // 5. Add credits in a transaction
    const userRef = db.doc(`users/${targetUid}`);
    const txnCollection = db.collection(
      `users/${targetUid}/balanceTransactions`,
    );

    const newBalance = await db.runTransaction(async (txn) => {
      const snap = await txn.get(userRef);
      const currentBalance: number = snap.data()?.balance ?? 0;
      const updatedBalance = currentBalance + amount;

      txn.set(txnCollection.doc(), {
        reasonKey: "admin_adjustment" as TransactionReasonKey,
        amount: amount,
        balanceAfter: updatedBalance,
        createdAt: FieldValue.serverTimestamp(),
        adminUid: callerUid,
      });
      txn.update(userRef, { balance: updatedBalance });

      return updatedBalance;
    });

    return { email, amount, newBalance };
  },
);
