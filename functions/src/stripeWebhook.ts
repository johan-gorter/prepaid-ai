import { FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import type Stripe from "stripe";
import { db } from "./admin.js";
import { type TransactionReasonKey } from "./balance.js";
import { FUNCTIONS_REGION } from "./region.js";
import { getStripeBackend, getStripeClient } from "./stripe.js";

/**
 * Credit a session's purchase to the user's balance idempotently.
 * Uses a deterministic transaction doc id (`stripe_<sessionId>`) so duplicate
 * Stripe deliveries are no-ops.
 */
async function fulfillSession(session: Stripe.Checkout.Session): Promise<void> {
  const uid = session.client_reference_id;
  const credits = Number(session.metadata?.credits);

  if (!uid || !credits || isNaN(credits) || credits <= 0) {
    logger.error("stripeWebhook: missing uid or credits", {
      sessionId: session.id,
      uid,
      credits: session.metadata?.credits,
    });
    return;
  }

  const userRef = db.doc(`users/${uid}`);
  const txnRef = db.doc(
    `users/${uid}/balanceTransactions/stripe_${session.id}`,
  );

  await db.runTransaction(async (txn) => {
    const existing = await txn.get(txnRef);
    if (existing.exists) {
      logger.info("stripeWebhook: duplicate delivery ignored", {
        sessionId: session.id,
      });
      return;
    }

    const snap = await txn.get(userRef);
    const currentBalance: number = snap.data()?.balance ?? 0;
    const newBalance = currentBalance + credits;

    txn.set(txnRef, {
      reasonKey: "credit_purchase" as TransactionReasonKey,
      amount: credits,
      balanceAfter: newBalance,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        stripeSessionId: session.id,
        ...(session.metadata?.packageId
          ? { packageId: session.metadata.packageId }
          : {}),
      },
    });
    txn.set(userRef, { balance: newBalance }, { merge: true });
  });
}

export const stripeWebhook = onRequest(
  {
    region: FUNCTIONS_REGION,
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_BACKEND"],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Dummy backend doesn't use webhooks — credits are added synchronously.
    if (getStripeBackend() === "dummy") {
      res.status(200).send("ok");
      return;
    }

    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      // Misconfigured deploy — Stripe retries cannot fix this. ACK to stop retries.
      logger.error("stripeWebhook: STRIPE_WEBHOOK_SECRET not configured");
      res.status(200).send("Misconfigured: webhook secret not set");
      return;
    }
    if (!sig) {
      // Bad request from a non-Stripe caller — 400 is fine, Stripe always sends it.
      res.status(400).send("Missing stripe-signature header");
      return;
    }

    let event: Stripe.Event;
    try {
      const stripe = getStripeClient();
      event = stripe.webhooks.constructEvent(
        req.rawBody as unknown as Buffer,
        sig,
        webhookSecret,
      );
    } catch (err) {
      res.status(400).send(`Webhook signature verification failed: ${err}`);
      return;
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        // For async payment methods (SEPA, ACH, BNPL...) payment_status is
        // "unpaid" until the bank settles — wait for async_payment_succeeded.
        if (session.payment_status !== "paid") {
          logger.info("stripeWebhook: payment pending, awaiting settlement", {
            sessionId: session.id,
            status: session.payment_status,
          });
          res.status(200).send("Payment pending");
          return;
        }
        await fulfillSession(session);
      } else if (event.type === "checkout.session.async_payment_succeeded") {
        await fulfillSession(event.data.object);
      } else if (event.type === "checkout.session.async_payment_failed") {
        logger.warn("stripeWebhook: async payment failed", {
          sessionId: event.data.object.id,
        });
      }
      // All other event types: ack and ignore.
    } catch (err) {
      logger.error("stripeWebhook: handler error", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      // Transient — let Stripe retry.
      res.status(500).send("Internal error");
      return;
    }

    res.status(200).json({ received: true });
  },
);
