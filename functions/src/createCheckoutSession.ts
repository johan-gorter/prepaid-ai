import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin.js";
import { type TransactionReasonKey } from "./balance.js";
import { CREDIT_VALUE_USD } from "./credits.js";
import { FUNCTIONS_REGION } from "./region.js";
import { getStripeBackend, getStripeClient } from "./stripe.js";
import { isAllowedOrigin } from "./utils.js";

const MIN_CREDITS = 10;
const MAX_CREDITS = 10_000;

function validateRedirectUrl(url: unknown, name: string): string {
  if (typeof url !== "string") {
    throw new HttpsError("invalid-argument", `${name} must be a string`);
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpsError("invalid-argument", `${name} is not a valid URL`);
  }
  if (!isAllowedOrigin(parsed.origin)) {
    throw new HttpsError(
      "invalid-argument",
      `${name} origin not allowed: ${parsed.origin}`,
    );
  }
  return url;
}

export const createCheckoutSession = onCall(
  {
    region: FUNCTIONS_REGION,
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_BACKEND"],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
      throw new HttpsError("unauthenticated", "Authentication required");

    const { credits, successUrl, cancelUrl } = request.data as {
      credits: unknown;
      successUrl: unknown;
      cancelUrl: unknown;
    };

    if (
      typeof credits !== "number" ||
      !Number.isInteger(credits) ||
      credits < MIN_CREDITS ||
      credits > MAX_CREDITS
    ) {
      throw new HttpsError(
        "invalid-argument",
        `credits must be an integer between ${MIN_CREDITS} and ${MAX_CREDITS}`,
      );
    }
    const validatedSuccessUrl = validateRedirectUrl(successUrl, "successUrl");
    const validatedCancelUrl = validateRedirectUrl(cancelUrl, "cancelUrl");

    // 1 credit = $0.01 USD = 1 cent
    const priceCents = Math.round(credits * CREDIT_VALUE_USD * 100);
    const backend = getStripeBackend();

    if (backend === "dummy") {
      // Emulator / dummy mode: credit the account directly, no Stripe call.
      const userRef = db.doc(`users/${uid}`);
      const txnRef = db.collection(`users/${uid}/balanceTransactions`).doc();

      await db.runTransaction(async (txn) => {
        const snap = await txn.get(userRef);
        const currentBalance: number = snap.data()?.balance ?? 0;
        const newBalance = currentBalance + credits;

        txn.set(txnRef, {
          reasonKey: "credit_purchase" as TransactionReasonKey,
          amount: credits,
          balanceAfter: newBalance,
          createdAt: FieldValue.serverTimestamp(),
          metadata: { credits, source: "dummy" },
        });
        txn.set(userRef, { balance: newBalance }, { merge: true });
      });

      return { dummy: true as const, credits };
    }

    // Production: create a Stripe Checkout session and return the URL.
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: uid,
      ...(request.auth?.token.email
        ? { customer_email: request.auth.token.email }
        : {}),
      metadata: { credits: String(credits) },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `${credits} credits — payasyougo.app` },
            unit_amount: priceCents,
          },
          quantity: 1,
        },
      ],
      success_url: validatedSuccessUrl,
      cancel_url: validatedCancelUrl,
    });

    return { url: session.url };
  },
);
