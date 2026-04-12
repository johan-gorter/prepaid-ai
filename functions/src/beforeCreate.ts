import { HttpsError } from "firebase-functions/v2/https";
import { beforeUserCreated } from "firebase-functions/v2/identity";

// ---------------------------------------------------------------------------
// Blocking function — restrict non-production sign-ups to @johangorter.com
// ---------------------------------------------------------------------------
const ALLOWED_DOMAIN = "johangorter.com";

export const beforeCreate = beforeUserCreated(
  { region: "europe-west1" },
  (event) => {
    // Skip domain check in production and when running in the Firebase emulator
    const env = process.env.ENVIRONMENT;
    if (env === "production") return;
    if (process.env.FUNCTIONS_EMULATOR === "true") return;

    const email = event.data?.email;
    if (!email || !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      throw new HttpsError(
        "permission-denied",
        `Only @${ALLOWED_DOMAIN} accounts are allowed in this environment`,
      );
    }
  },
);
