import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin.js";
import { type TransactionReasonKey } from "./balance.js";
import { CREDIT_PACKAGES, type CreditPackageId } from "./credits.js";
import {
  getCreditPackage,
  getStripeBackend,
  getStripeClient,
} from "./stripe.js";

export const createCheckoutSession = onCall(
  {
    region: "europe-west1",
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_BACKEND"],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication required");

    const { packageId, successUrl, cancelUrl } = request.data as {
      packageId: unknown;
      successUrl: unknown;
      cancelUrl: unknown;
    };

    const validIds = CREDIT_PACKAGES.map((p) => p.id) as string[];
    if (typeof packageId !== "string" || !validIds.includes(packageId)) {
      throw new HttpsError(
        "invalid-argument",
        `packageId must be one of: ${validIds.join(", ")}`,
      );
    }
    if (typeof successUrl !== "string" || !successUrl.startsWith("http")) {
      throw new HttpsError("invalid-argument", "successUrl must be a valid URL");
    }
    if (typeof cancelUrl !== "string" || !cancelUrl.startsWith("http")) {
      throw new HttpsError("invalid-argument", "cancelUrl must be a valid URL");
    }

    const pkg = getCreditPackage(packageId as CreditPackageId);
    const backend = getStripeBackend();

    if (backend === "dummy") {
      // Emulator / dummy mode: credit the account directly, no Stripe call.
      const userRef = db.doc(`users/${uid}`);
      const txnRef = db
        .collection(`users/${uid}/balanceTransactions`)
        .doc();

      await db.runTransaction(async (txn) => {
        const snap = await txn.get(userRef);
        const currentBalance: number = snap.data()?.balance ?? 0;
        const newBalance = currentBalance + pkg.credits;

        txn.set(txnRef, {
          reasonKey: "credit_purchase" as TransactionReasonKey,
          amount: pkg.credits,
          balanceAfter: newBalance,
          createdAt: FieldValue.serverTimestamp(),
          metadata: { packageId, source: "dummy" },
        });
        txn.update(userRef, { balance: newBalance });
      });

      return { dummy: true as const, credits: pkg.credits };
    }

    // Production: create a Stripe Checkout session and return the URL.
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: uid,
      metadata: { credits: String(pkg.credits), packageId },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `${pkg.credits} credits — payasyougo.app` },
            unit_amount: pkg.priceCents,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return { url: session.url };
  },
);
