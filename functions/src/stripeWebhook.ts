import { FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { db } from "./admin.js";
import { type TransactionReasonKey } from "./balance.js";
import { getStripeBackend, getStripeClient } from "./stripe.js";

export const stripeWebhook = onRequest(
  {
    region: "europe-west1",
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
    if (!sig || !webhookSecret) {
      res.status(400).send("Missing stripe-signature header or webhook secret");
      return;
    }

    let event;
    try {
      const stripe = getStripeClient();
      // rawBody is a Buffer provided by Firebase before body parsing
      event = stripe.webhooks.constructEvent(
        req.rawBody as unknown as Buffer,
        sig,
        webhookSecret,
      );
    } catch (err) {
      res.status(400).send(`Webhook signature verification failed: ${err}`);
      return;
    }

    if (event.type !== "checkout.session.completed") {
      res.status(200).send("Ignored");
      return;
    }

    const session = event.data.object;
    const uid = session.client_reference_id;
    const credits = Number(session.metadata?.credits);

    if (!uid || !credits || isNaN(credits) || credits <= 0) {
      res
        .status(400)
        .send("Missing or invalid uid / credits in session metadata");
      return;
    }

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
        metadata: {
          stripeSessionId: session.id,
          packageId: session.metadata?.packageId,
        },
      });
      txn.update(userRef, { balance: newBalance });
    });

    res.status(200).json({ received: true });
  },
);
