// ---------------------------------------------------------------------------
// Stripe backend selection: "stripe" | "dummy"
// Set via STRIPE_BACKEND secret. Defaults to "dummy" in emulator, "stripe" otherwise.
// - "stripe" — real Stripe Checkout (requires STRIPE_SECRET_KEY)
// - "dummy"  — skip Stripe; add credits directly (emulator / sandbox testing)
// ---------------------------------------------------------------------------

import Stripe from "stripe";
import { CREDIT_PACKAGES, type CreditPackageId } from "./credits.js";

export type StripeBackend = "stripe" | "dummy";

export function getStripeBackend(): StripeBackend {
  const raw = process.env.STRIPE_BACKEND?.toLowerCase();
  if (raw === "stripe" || raw === "dummy") return raw;
  if (process.env.FUNCTIONS_EMULATOR === "true") return "dummy";
  return "stripe";
}

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key);
}

export function getCreditPackage(
  id: CreditPackageId,
): (typeof CREDIT_PACKAGES)[number] {
  const pkg = CREDIT_PACKAGES.find((p) => p.id === id);
  if (!pkg) throw new Error(`Unknown credit package: ${id}`);
  return pkg;
}
