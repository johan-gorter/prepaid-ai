import { HttpsError, onCall } from "firebase-functions/v2/https";
import { bucket, db } from "./admin.js";

export const deleteUserAccount = onCall(
  { region: "europe-west1", timeoutSeconds: 120 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    // Collect storage paths from documents before deleting them
    const storagePaths: string[] = [];

    const renovationsRef = db.collection(`users/${uid}/renovations`);
    const renovations = await renovationsRef.listDocuments();
    for (const renoDoc of renovations) {
      const renoSnap = await renoDoc.get();
      if (renoSnap.exists) {
        const reno = renoSnap.data()!;
        if (reno.originalImagePath) storagePaths.push(reno.originalImagePath);
      }

      const impressions = await renoDoc
        .collection("impressions")
        .listDocuments();
      for (const impDoc of impressions) {
        const impSnap = await impDoc.get();
        if (impSnap.exists) {
          const imp = impSnap.data()!;
          if (imp.sourceImagePath) storagePaths.push(imp.sourceImagePath);
          if (imp.resultImagePath) storagePaths.push(imp.resultImagePath);
          if (imp.compositeImagePath) storagePaths.push(imp.compositeImagePath);
        }
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

    // Delete collected storage files individually
    const uniquePaths = [...new Set(storagePaths)];
    await Promise.allSettled(
      uniquePaths.map((p) =>
        bucket
          .file(p)
          .delete()
          .catch(() => {}),
      ),
    );

    // Bulk-delete as safety net for any files not tracked in documents
    try {
      await bucket.deleteFiles({ prefix: `users/${uid}/` });
    } catch (err) {
      console.warn(`Bulk storage cleanup for user ${uid} failed:`, err);
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
