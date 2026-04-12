import { HttpsError, onCall } from "firebase-functions/v2/https";
import { bucket, db } from "./admin.js";

export const deleteUserAccount = onCall(
  { region: "europe-west1", timeoutSeconds: 120 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    // Delete all renovations and their impressions subcollections
    const renovationsRef = db.collection(`users/${uid}/renovations`);
    const renovations = await renovationsRef.listDocuments();
    for (const renoDoc of renovations) {
      const impressions = await renoDoc
        .collection("impressions")
        .listDocuments();
      for (const impDoc of impressions) {
        await impDoc.delete();
      }
      await renoDoc.delete();
    }

    // Delete balance transactions
    const balanceTxns = await db
      .collection(`users/${uid}/balanceTransactions`)
      .listDocuments();
    for (const txnDoc of balanceTxns) {
      await txnDoc.delete();
    }

    // Delete all user files from Storage
    try {
      await bucket.deleteFiles({ prefix: `users/${uid}/` });
    } catch {
      // Ignore if no files exist
    }

    // Delete feedback documents authored by this user
    const feedbackQuery = db.collection("feedback").where("uid", "==", uid);
    const feedbackDocs = await feedbackQuery.get();
    for (const feedbackDoc of feedbackDocs.docs) {
      await feedbackDoc.ref.delete();
    }

    // Delete the user profile document
    await db.doc(`users/${uid}`).delete();

    return { success: true };
  },
);
