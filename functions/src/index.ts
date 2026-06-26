import { beforeCreate as beforeCreateFn } from "./beforeCreate.js";

export { addCredits } from "./addCredits.js";
// The beforeCreate blocking function is a no-op in the emulator (it only
// enforces the non-prod sign-up domain allow-list on real deploys). Registering
// it with the Auth emulator intermittently fails with "Premature close" and
// crashes the entire emulator suite, so skip registering it under the emulator —
// it does nothing there anyway. Real deploys export it unchanged.
export const beforeCreate =
  process.env.FUNCTIONS_EMULATOR === "true" ? undefined : beforeCreateFn;
export { chat } from "./chat.js";
export { createCheckoutSession } from "./createCheckoutSession.js";
export { deleteUserAccount } from "./deleteUserAccount.js";
export { expireCreditTransfers } from "./expireCreditTransfers.js";
export { notificationResponse } from "./notificationResponse.js";
export { processImpression } from "./processImpression.js";
export { getStripeConfig } from "./stripe.js";
export { purchaseCredits } from "./purchaseCredits.js";
export { sendCreditTransfer } from "./sendCreditTransfer.js";
export { shareImage, shareOg } from "./share.js";
export { stripeWebhook } from "./stripeWebhook.js";
export { trackEvent } from "./trackEvent.js";
