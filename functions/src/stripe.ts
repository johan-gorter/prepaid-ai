// ---------------------------------------------------------------------------
// Stripe backend selection: "stripe" | "dummy"
// Set via STRIPE_BACKEND secret. Defaults to "dummy" in emulator, "stripe" otherwise.
// - "stripe" — real Stripe Checkout (requires STRIPE_SECRET_KEY)
// - "dummy"  — skip Stripe; add credits directly (emulator / sandbox testing)
// ---------------------------------------------------------------------------

import { HttpsError, onCall } from "firebase-functions/v2/https";
import Stripe from "stripe";

export type StripeBackend = "stripe" | "dummy";

// Pinned API version — change deliberately when upgrading.
const STRIPE_API_VERSION = "2025-02-24.acacia" as const;

export function getStripeBackend(): StripeBackend {
  const raw = process.env.STRIPE_BACKEND?.toLowerCase();
  if (raw === "stripe" || raw === "dummy") return raw;
  if (process.env.FUNCTIONS_EMULATOR === "true") return "dummy";
  return "stripe";
}

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });
}

/**
 * Returns the active Stripe backend so the frontend can render an accurate
 * "dummy mode" banner regardless of how the build was produced.
 */
export const getStripeConfig = onCall(
  {
    region: "europe-west1",
    secrets: ["STRIPE_BACKEND"],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }
    return { backend: getStripeBackend() };
  },
);
