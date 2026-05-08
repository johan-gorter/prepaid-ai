# Stripe Integration

This document explains how the credit purchase flow works in production (real Stripe) and in local emulator mode (dummy backend).

## Architecture overview

```
Frontend (BuyCreditsPage)
  └── calls createCheckoutSession (Firebase Callable Function)
        ├── STRIPE_BACKEND = "stripe"  → creates Stripe Checkout session → returns URL
        │     └── frontend redirects to Stripe → user pays → Stripe calls stripeWebhook
        │           └── stripeWebhook verifies signature → adds credits to Firestore
        └── STRIPE_BACKEND = "dummy"  → adds credits directly → returns { dummy: true }
              └── frontend shows "N credits added" message
```

Two Cloud Functions are involved:

| Function                | Type     | Purpose                                                        |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `createCheckoutSession` | Callable | Creates a Stripe Checkout session or performs a dummy purchase |
| `stripeWebhook`         | HTTP     | Receives and verifies Stripe webhook; adds credits             |

The `STRIPE_BACKEND` Secret Manager secret controls which path is taken. In emulator mode the code defaults to `dummy` regardless of the secret.

---

## Local emulator (dummy mode)

When `FUNCTIONS_EMULATOR === "true"` (Firebase local emulator) or `STRIPE_BACKEND === "dummy"`, calling `createCheckoutSession` **does not contact Stripe at all**. Instead it:

1. Validates the requested credit amount (10–10,000)
2. Runs a Firestore transaction to increment the user's balance
3. Returns `{ dummy: true, credits: N }`

The frontend detects the `dummy: true` flag and shows an inline confirmation instead of redirecting to Stripe.

**To test locally:**

```bash
npm -s run services:start emulators
npm -s run services:start dev:emulators
npm -s run services:wait emulators dev:emulators
npm -s run emulators:seed

# Open http://localhost:5174, sign in, navigate to Buy Credits, pick an amount and confirm.
# Credits appear immediately — no Stripe account or internet access needed.
```

---

## Production setup

### 1. Create a Stripe account

Go to [https://dashboard.stripe.com](https://dashboard.stripe.com) and create an account.

### 2. Get your API keys

In Stripe Dashboard → **Developers → API keys**:

| Key             | Where used                                   |
| --------------- | -------------------------------------------- |
| Secret key      | `STRIPE_SECRET_KEY` in Secret Manager        |
| Publishable key | Not needed — we use Stripe Checkout (hosted) |

Use **live keys** (`sk_live_...`) for production and **test keys** (`sk_test_...`) for sandbox.

### 3. Register the webhook endpoint

The `stripeWebhook` function is an HTTP Cloud Function exported from
`functions/src/stripeWebhook.ts`. It is deployed in `europe-west1`, so the
stable Firebase Functions URL is:

```
https://europe-west1-<project-id>.cloudfunctions.net/stripeWebhook
```

The public Hosting URL, such as `https://payasyougo.app` or a `.web.app`
domain, serves the frontend. It is not the webhook base URL unless a Firebase
Hosting rewrite is added explicitly.

Current environment URLs:

| Environment    | Status                    | Stripe webhook endpoint                                                       |
| -------------- | ------------------------- | ----------------------------------------------------------------------------- |
| Local emulator | Use Stripe CLI forwarding | `http://localhost:5001/prepaid-ai-emulator/europe-west1/stripeWebhook`        |
| Sandbox        | Deployed                  | `https://europe-west1-prepaid-ai-sandbox.cloudfunctions.net/stripeWebhook`    |
| Dev            | Deployed                  | `https://europe-west1-prepaid-ai-dev.cloudfunctions.net/stripeWebhook`        |
| Production     | Created                   | `https://europe-west1-payasyougo-production.cloudfunctions.net/stripeWebhook` |

Firebase Functions v2 also exposes a Cloud Run URL shaped like this:

```
https://stripewebhook-<hash>-ew.a.run.app
```

Prefer the stable `cloudfunctions.net` URL for Stripe. You can also confirm the
exact deployed URL in Firebase Console -> Functions, or from `firebase deploy`
output.

In Stripe Dashboard → **Developers → Webhooks → Add endpoint**:

- **URL**: the `stripeWebhook` URL above
- **Events to listen to**: `checkout.session.completed`

Copy the **Signing secret** (`whsec_...`) — you will need it in the next step.

### 4. Store secrets in GCP Secret Manager

After running `terraform apply`, the secret resources exist but have no value.
Use the `push-secrets` script to populate them from a local (gitignored) env file.

**Add the secrets to your `.env` file (or a dedicated `.env.sandbox` / `.env.dev` — all gitignored):**

```ini
# .env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
GEMINI_API_KEY=AIza...
```

**Push all secrets in the file to Secret Manager in one command:**

```powershell
node scripts/push-secrets.mjs .env sandbox
# or: node scripts/push-secrets.mjs .env dev
# or: node scripts/push-secrets.mjs .env production
# or with a dedicated file: node scripts/push-secrets.mjs .env.sandbox sandbox
```

The script writes each value to a temp file before calling `gcloud`, so no
trailing newline is ever included (a common pitfall with `Read-Host` piping).

### 5. Switch STRIPE_BACKEND to "stripe"

`stripe_backend` defaults to `"dummy"` in Terraform so a fresh `terraform apply`
never produces a deploy where Cloud Functions reference unset Stripe secrets.
Flip it to `"stripe"` in a **second** apply, after step 4 has populated
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`:

```hcl
# terraform/environments/production.tfvars
stripe_backend = "stripe"
```

```bash
cd terraform
terraform init -reconfigure "-backend-config=bucket=prepaid-ai-terraform-state" "-backend-config=prefix=env/production"
terraform apply "-var-file=environments/production.tfvars"
```

Then redeploy functions to pick up the new secret value:

```bash
firebase deploy --only functions --project payasyougo-production
```

For sandbox and dev, set `stripe_backend = "stripe"` in the `.tfvars` file after the secrets are populated.

---

## Credit amounts

The buy-credits page accepts any integer between 10 and 10,000 credits. There are no fixed packages — the Stripe session is created with inline `price_data` on the fly. No pre-created Stripe products or prices are needed.

1 credit = $0.01 USD (1 cent). This constant lives in `functions/src/credits.ts` (`CREDIT_VALUE_USD`) and its client-side mirror `src/credits.ts`.

---

## Payment flow (production detail)

1. User picks an amount on `/buy-credits` (10–10,000 credits).
2. Frontend calls `createCheckoutSession({ credits, successUrl, cancelUrl })`.
3. Function creates a Stripe Checkout session with inline `price_data` (no pre-created Stripe product needed):
   - `client_reference_id`: Firebase Auth UID (used in webhook to identify the user)
   - `customer_email`: pre-filled from Firebase Auth token
   - `metadata.credits`: number of credits to add
   - `success_url`: `<origin>/balance/success?session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url`: `<origin>/buy-credits`
4. Frontend receives the session URL and redirects to `checkout.stripe.com/...`.
5. User completes payment on Stripe's hosted page.
6. Stripe posts `checkout.session.completed` to `stripeWebhook`.
7. `stripeWebhook` verifies the signature using `STRIPE_WEBHOOK_SECRET`.
8. Credits are added to `users/{uid}.balance` via a Firestore transaction, with a `balanceTransactions` record.
9. Stripe redirects the user to `/balance/success?session_id=...`.
10. The success page shows a confirmation; Firestore real-time listener updates the balance display.

---

## Testing with Stripe test mode

With `sk_test_...` keys and `STRIPE_BACKEND = "stripe"` in sandbox:

- Use Stripe's test card numbers: `4242 4242 4242 4242`, any future expiry, any CVC.
- The webhook must be reachable. For local testing of the webhook path specifically, use the Stripe CLI:

```bash
# Install Stripe CLI, then forward events to the local emulator
stripe listen --forward-to http://localhost:5001/prepaid-ai-emulator/europe-west1/stripeWebhook
```

This gives you a local `whsec_...` signing secret to use with the emulator. Note: in normal local development, dummy mode is sufficient — you only need this if you want to exercise the real webhook code path locally.

---

## Idempotency

Stripe delivers webhooks at-least-once. The handler stores each fulfilment as
`users/{uid}/balanceTransactions/stripe_<sessionId>` and checks `existing.exists`
inside the transaction, so a duplicate delivery (or the
`checkout.session.completed` + `checkout.session.async_payment_succeeded` pair
for async payments) becomes a no-op.

## Async payment methods

For SEPA, ACH, BNPL, OXXO and other async methods, `checkout.session.completed`
fires when the customer finishes Checkout but `payment_status` stays `unpaid`
until the underlying debit settles. The handler:

- Grants credits on `checkout.session.completed` only when `payment_status === "paid"`.
- Grants credits on `checkout.session.async_payment_succeeded` (uses the same
  deterministic transaction doc id, so no double-credit if both events fire).
- Logs `checkout.session.async_payment_failed` (no credits granted, nothing to reverse).

---

## Security notes

- The webhook signature verification (`stripe.webhooks.constructEvent`) ensures only real Stripe events are processed. Never skip it.
- `client_reference_id` is the Firebase Auth UID set by the server when creating the session; it cannot be tampered with by the client.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are stored in GCP Secret Manager and injected into Cloud Functions at runtime. They are never exposed to the frontend.
- The `createCheckoutSession` function is a Firebase Callable, so it verifies the caller's Firebase Auth token before doing anything.
