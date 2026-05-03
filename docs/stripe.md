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

| Function               | Type       | Purpose                                                        |
| ---------------------- | ---------- | -------------------------------------------------------------- |
| `createCheckoutSession`| Callable   | Creates a Stripe Checkout session or performs a dummy purchase |
| `stripeWebhook`        | HTTP       | Receives and verifies Stripe webhook; adds credits             |

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

| Key               | Where used                                    |
| ----------------- | --------------------------------------------- |
| Secret key        | `STRIPE_SECRET_KEY` in Secret Manager         |
| Publishable key   | Not needed — we use Stripe Checkout (hosted)  |

Use **live keys** (`sk_live_...`) for production and **test keys** (`sk_test_...`) for sandbox.

### 3. Register the webhook endpoint

After deploying the Cloud Functions, the `stripeWebhook` URL is:

```
https://<region>-<project-id>.cloudfunctions.net/stripeWebhook
```

or (Cloud Run URL):

```
https://stripewebhook-<hash>-ew.a.run.app
```

Find the exact URL in the Firebase Console → Functions, or from `firebase deploy` output.

In Stripe Dashboard → **Developers → Webhooks → Add endpoint**:

- **URL**: the `stripeWebhook` URL above
- **Events to listen to**: `checkout.session.completed`

Copy the **Signing secret** (`whsec_...`) — you will need it in the next step.

### 4. Store secrets in GCP Secret Manager

After running `terraform apply`, the secret resources exist but have no value. Set them manually:

```bash
# Stripe secret key
echo -n "sk_live_YOUR_KEY_HERE" | \
  gcloud secrets versions add STRIPE_SECRET_KEY --data-file=- --project=prepaid-ai-production

# Stripe webhook signing secret
echo -n "whsec_YOUR_SIGNING_SECRET_HERE" | \
  gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=- --project=prepaid-ai-production
```

For sandbox, use `sk_test_...` and point to `prepaid-ai-sandbox`:

```bash
echo -n "sk_test_YOUR_KEY_HERE" | \
  gcloud secrets versions add STRIPE_SECRET_KEY --data-file=- --project=prepaid-ai-sandbox

echo -n "whsec_YOUR_SIGNING_SECRET_HERE" | \
  gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=- --project=prepaid-ai-sandbox
```

### 5. Switch STRIPE_BACKEND to "stripe"

`STRIPE_BACKEND` is managed by Terraform. Set it in the appropriate `.tfvars` file:

| Environment | File                                    | Value      |
| ----------- | --------------------------------------- | ---------- |
| production  | `terraform/environments/production.tfvars` | `"stripe"` |
| sandbox     | `terraform/environments/sandbox.tfvars`    | `"dummy"` (default — change when you add Stripe test keys) |

After editing the `.tfvars` file, re-apply Terraform:

```bash
cd terraform
terraform init -reconfigure \
  "-backend-config=bucket=prepaid-ai-terraform-state" \
  "-backend-config=prefix=env/production"
terraform apply -var-file=environments/production.tfvars
```

Then redeploy functions to pick up the new secret value:

```bash
firebase deploy --only functions --project prepaid-ai-production
```

---

## Credit packages

Packages are defined in two places (must be kept in sync):

| File                               | Used by           |
| ---------------------------------- | ----------------- |
| `functions/src/credits.ts`         | Cloud Functions   |
| `src/types.ts`                     | Vue frontend      |

Current packages (1 credit = $0.01 USD):

| Package ID       | Credits | Price  |
| ---------------- | ------- | ------ |
| `credits_100`    | 100     | $1.00  |
| `credits_500`    | 500     | $5.00  |
| `credits_1000`   | 1,000   | $10.00 |
| `credits_5000`   | 5,000   | $50.00 |

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

The webhook handler processes `checkout.session.completed` events. Stripe may deliver the same event more than once. The current implementation does **not** deduplicate by `stripeSessionId` — a duplicate delivery would add credits twice.

To make it idempotent, add a Firestore check before the transaction:

```typescript
// Example: check if session already processed
const existing = await db
  .collectionGroup("balanceTransactions")
  .where("metadata.stripeSessionId", "==", session.id)
  .limit(1)
  .get();
if (!existing.empty) {
  res.status(200).json({ received: true, duplicate: true });
  return;
}
```

This is left as a future improvement. In practice, Stripe retries are rare for successful webhook deliveries.

---

## Security notes

- The webhook signature verification (`stripe.webhooks.constructEvent`) ensures only real Stripe events are processed. Never skip it.
- `client_reference_id` is the Firebase Auth UID set by the server when creating the session; it cannot be tampered with by the client.
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are stored in GCP Secret Manager and injected into Cloud Functions at runtime. They are never exposed to the frontend.
- The `createCheckoutSession` function is a Firebase Callable, so it verifies the caller's Firebase Auth token before doing anything.
