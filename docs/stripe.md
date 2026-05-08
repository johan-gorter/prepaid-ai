# Stripe Integration

This document explains how the credit purchase flow works in production (real Stripe) and in local emulator mode (dummy backend).

## Architecture overview

```
Frontend (BalancePage)
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

1. Looks up the credit package by ID
2. Runs a Firestore transaction to increment the user's balance
3. Returns `{ dummy: true, credits: N }`

The frontend detects the `dummy: true` flag and shows an inline confirmation instead of redirecting to Stripe.

**To test locally:**

```bash
npm -s run services:start emulators
npm -s run services:start dev:emulators
npm -s run services:wait emulators dev:emulators
npm -s run emulators:seed

# Open http://localhost:5174, sign in, navigate to Balance, click any package.
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

| Environment    | Status                                       | Stripe webhook endpoint                                                       |
| -------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| Local emulator | Use Stripe CLI forwarding                    | `http://localhost:5001/prepaid-ai-emulator/europe-west1/stripeWebhook`        |
| Sandbox        | Expected URL after deploying `stripeWebhook` | `https://europe-west1-prepaid-ai-sandbox.cloudfunctions.net/stripeWebhook`    |
| Dev            | Deployed                                     | `https://europe-west1-prepaid-ai-dev.cloudfunctions.net/stripeWebhook`        |
| Production     | Created                                      | `https://europe-west1-payasyougo-production.cloudfunctions.net/stripeWebhook` |

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
Set them manually from PowerShell. Each command prompts for the secret value and
pipes it to `gcloud`.

```powershell
Read-Host "Stripe secret key" | gcloud secrets versions add STRIPE_SECRET_KEY --data-file=- --project=payasyougo-production

Read-Host "Stripe webhook signing secret" | gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=- --project=payasyougo-production
```

For sandbox, use `sk_test_...` and point to `prepaid-ai-sandbox`:

```powershell
Read-Host "Stripe secret key" | gcloud secrets versions add STRIPE_SECRET_KEY --data-file=- --project=prepaid-ai-sandbox

Read-Host "Stripe webhook signing secret" | gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=- --project=prepaid-ai-sandbox
```

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

For sandbox, leave `stripe_backend` at the default `"dummy"` until you've
added test keys (`sk_test_...`, `whsec_...`) and want to exercise the real
Stripe path.

---

## Credit packages

Packages are defined in two places (must be kept in sync):

| File                       | Used by         |
| -------------------------- | --------------- |
| `functions/src/credits.ts` | Cloud Functions |
| `src/types.ts`             | Vue frontend    |

Current packages (1 credit = $0.01 USD):

| Package ID     | Credits | Price  |
| -------------- | ------- | ------ |
| `credits_100`  | 100     | $1.00  |
| `credits_500`  | 500     | $5.00  |
| `credits_1000` | 1,000   | $10.00 |
| `credits_5000` | 5,000   | $50.00 |

To add or change packages: update both files, redeploy functions, rebuild the frontend.

---

## Payment flow (production detail)

1. User clicks a package button on `/balance`.
2. Frontend calls `createCheckoutSession({ packageId, successUrl, cancelUrl })`.
3. Function creates a Stripe Checkout session:
   - `client_reference_id`: Firebase Auth UID (used in webhook to identify the user)
   - `metadata.credits`: number of credits to add
   - `metadata.packageId`: package identifier
   - `success_url`: `<origin>/balance/success?session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url`: `<origin>/balance`
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
