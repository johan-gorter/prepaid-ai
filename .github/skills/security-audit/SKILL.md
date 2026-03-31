---
name: security-audit
description: "Comprehensive security audit for the Prepaid AI codebase and infrastructure. Use when: reviewing security posture, checking data isolation, verifying auth guards, auditing Firestore/Storage rules, validating Cloud Function triggers, checking domain restrictions on non-production environments, or preparing for billing integration."
argument-hint: "Optional: focus area (rules, functions, terraform, client, all)"
---

# Security Audit

## When to Use

- Before deploying to production
- After adding new Firestore collections, Storage paths, or Cloud Functions
- When auth or data-access patterns change
- When preparing for billing integration
- Periodic security review

## Audit Procedure

### Phase 1 — Data Isolation (Firestore Rules)

**Goal:** Every user can only read/write documents under their own `users/{uid}` subtree.

1. Open `firestore.rules` and verify every `match` block includes:
   ```
   request.auth != null && request.auth.uid == userId
   ```
2. Confirm **no** top-level wildcards (`match /{document=**}`) exist
3. Confirm **no** `allow read, write: if true` or `allow read, write: if request.auth != null` without `uid == userId`
4. For each new collection/subcollection, verify the rule path mirrors the data model:
   - `users/{userId}` — user profile
   - `users/{userId}/renovations/{renovationId}` — per-user renovations
   - `users/{userId}/renovations/{renovationId}/impressions/{impressionId}` — per-user impressions

**Command to review:**

```bash
cat firestore.rules
```

**Automated check (grep for dangerous patterns):**

```powershell
# Should return NO matches:
Select-String -Path firestore.rules -Pattern 'allow\s+(read|write|get|list|create|update|delete).*:\s*if\s+true' -CaseSensitive
Select-String -Path firestore.rules -Pattern 'match /\{document=\*\*\}'
# Should match ALL allow lines (every rule checks uid):
Select-String -Path firestore.rules -Pattern 'request\.auth\.uid\s*==\s*userId'
```

### Phase 2 — Data Isolation (Storage Rules)

**Goal:** Users can only read/write files under `users/{uid}/`.

1. Open `storage.rules` and verify the same `request.auth.uid == userId` pattern
2. Confirm no top-level wildcard paths allow unauthenticated or cross-user access
3. Verify the path structure matches what the client/functions actually write:
   - Client uploads: `users/{uid}/renovations/{renovationId}/original.png`, composites, masks
   - Function writes: `users/{uid}/results/{renovationId}/{impressionId}.png`

**Command to review:**

```bash
cat storage.rules
```

**Automated check:**

```powershell
# Should return NO matches:
Select-String -Path storage.rules -Pattern 'allow\s+(read|write).*:\s*if\s+true'
# Should match all allow lines:
Select-String -Path storage.rules -Pattern 'request\.auth\.uid\s*==\s*userId'
```

### Phase 3 — Cloud Functions Auth Verification

**Goal:** Every Cloud Function must verify the calling user's identity. Functions triggered by Firestore should validate that `event.params.userId` corresponds to the authenticated user's data path structure.

1. Open `functions/src/index.ts`
2. For **Firestore-triggered functions** (`onDocumentCreated`, `onDocumentWritten`, etc.):
   - Verify the trigger path includes `users/{userId}` — this ensures the function only fires for documents the Firestore rules already gate-keyed to the owner
   - Verify the function reads `event.params.userId` and uses it to scope all reads/writes (no cross-user data access)
   - Verify result files are written under the same `users/{userId}/` prefix
3. For any future **callable functions** (`onCall`):
   - Verify `context.auth` is checked at the top: `if (!context.auth) throw new HttpsError('unauthenticated')`
   - Verify `context.auth.uid` is used for all data access
4. Check that `GEMINI_API_KEY` is loaded via Secret Manager, never hardcoded

**Command to review:**

```powershell
Select-String -Path functions/src/index.ts -Pattern 'userId|event\.params|context\.auth|GEMINI_API_KEY'
```

**Verify trigger path includes userId scoping:**

```powershell
Select-String -Path functions/src/index.ts -Pattern 'users/\{userId\}'
```

### Phase 4 — Client-Side Auth Guards

**Goal:** All authenticated routes redirect to login when no user is signed in. All data access scopes to `currentUser.uid`.

1. **Router guards** — verify `src/router/index.ts`:
   - All routes except `/login` have `meta: { requiresAuth: true }`
   - `beforeEach` guard redirects unauthenticated users
2. **Composables** — verify each composable that accesses Firestore/Storage:
   - `useRenovations.ts`: all collection paths include `currentUser.value.uid`
   - `useImpressions.ts`: all collection paths include `user.uid`
   - `useStorageUrl.ts`: uses authenticated Storage SDK (tokens auto-attached)
3. **Views** — verify page components:
   - `NewRenovationPage.vue`: storage upload path includes `currentUser.value.uid`
   - `NewImpressionPage.vue`: storage upload path includes `currentUser.value.uid`
   - `RenovationDetailPage.vue`: Firestore reads include `currentUser.value.uid`

**Command to search for uid-scoped paths:**

```powershell
Select-String -Path src/composables/*.ts -Pattern 'currentUser\.value\.uid|user\.uid'
Select-String -Path src/views/*.vue -Pattern 'currentUser\.value\.uid'
```

**Command to find any unscoped Firestore access (should return NO matches):**

```powershell
# Look for collection/doc calls that don't include the uid:
Select-String -Path src/**/*.ts,src/**/*.vue -Pattern 'collection\(db,' | Select-String -NotMatch -Pattern 'currentUser|\.uid'
```

### Phase 5 — Non-Production Environment Domain Restrictions

**Goal:** Sandbox and dev environments should only allow `@johangorter.com` accounts. Production is open to all configured auth providers.

1. Check `terraform/modules/firebase-env/main.tf` for Identity Platform config
2. Verify `authorized_domains` are locked to project-specific domains
3. **Check for blocking functions** — a `beforeCreate` blocking function should reject emails not matching `@johangorter.com` on sandbox/dev environments
4. If no blocking function exists yet, **flag this as a finding** and recommend adding one

**What to look for in Terraform:**

```powershell
Select-String -Path terraform/modules/firebase-env/main.tf -Pattern 'blocking_function|beforeCreate|beforeSignIn|authorized_domain|tenant'
```

**Check environment tfvars:**

```powershell
Get-Content terraform/environments/sandbox.tfvars
Get-Content terraform/environments/dev.tfvars
Get-Content terraform/environments/production.tfvars
```

**Recommended fix if missing:** Add a `beforeCreate` blocking Cloud Function that checks email domain:

```typescript
// In a blocking function:
export const beforeCreate = beforeUserCreated((event) => {
  const email = event.data.email;
  const env = process.env.ENVIRONMENT;
  if (env !== "production" && !email?.endsWith("@johangorter.com")) {
    throw new HttpsError(
      "permission-denied",
      "Only @johangorter.com accounts allowed in this environment",
    );
  }
});
```

Register it in Terraform:

```hcl
resource "google_identity_platform_config" "auth" {
  blocking_functions {
    triggers {
      event_type   = "beforeCreate"
      function_uri = google_cloudfunctions2_function.before_create.url
    }
  }
}
```

### Phase 6 — Secrets & Credential Hygiene

**Goal:** No secrets committed to the repo. OAuth client secrets in tfvars must be marked sensitive or in CI secrets.

1. Check `.gitignore` includes `.env`, `.env.local`, `.env.*.local`
2. Verify `sandbox.auto.tfvars` does NOT contain OAuth secrets in plain text committed to the repo
3. Verify `google_oauth_client_secret` variable is marked `sensitive = true` in Terraform
4. Verify `GEMINI_API_KEY` is stored in Secret Manager, not environment variables or code

**Commands:**

```powershell
# Check for committed secrets in tfvars files:
Select-String -Path terraform/*.tfvars,terraform/*.auto.tfvars -Pattern 'secret|GOCSPX|private_key' -CaseSensitive:$false
# Verify variable sensitivity:
Select-String -Path terraform/variables.tf,terraform/modules/firebase-env/variables.tf -Pattern 'sensitive\s*=\s*true'
```

### Phase 7 — Service Worker & Offline Security

**Goal:** Service worker does NOT cache auth, Firestore, or Cloud Functions traffic. Only images are runtime-cached. No auth tokens are stored in caches.

1. Review `src/sw.ts`:
   - Only `GET` requests to Firebase Storage URLs are cached
   - Navigation route falls back to `index.html` (SPA shell)
   - No auth headers or tokens in cache keys
2. Verify `localStorage` usage in `useStorageUrl.ts` stores only download URLs (not tokens)

**Command:**

```powershell
Select-String -Path src/sw.ts -Pattern 'registerRoute|cache|fetch'
Select-String -Path src/composables/useStorageUrl.ts -Pattern 'localStorage|sessionStorage'
```

### Phase 8 — Billing Readiness Check

> **NOTE:** When billing is implemented, update this section to check for:
>
> - Rate limiting on AI processing functions (prevent fund drain)
> - Balance checks DURING function execution (not just at request time)
> - Idempotency guards to prevent double-charging
> - Illegal ways to acquire new funds (referral abuse, coupon replay, negative-amount transactions)
> - Webhook signature verification for payment provider callbacks
> - Server-side balance validation (never trust client-reported balance)

Currently: No billing system exists. The `processImpression` function runs without usage metering. This is acceptable pre-launch but must be gated before billing goes live.

**Future checks to add:**

```powershell
# When billing is implemented, verify balance check in every chargeable function:
Select-String -Path functions/src/*.ts -Pattern 'checkBalance|deductCredits|verifyFunds'
# Verify no client-side balance manipulation:
Select-String -Path src/**/*.ts,src/**/*.vue -Pattern 'balance|credits|funds' | Select-String -NotMatch -Pattern 'readonly|display|show'
```

### Phase 9 — Attack Vector Scan

**Goal:** Proactively identify additional attack vectors beyond the standard checks. Scan the codebase for patterns that could be exploited and verify each is properly secured.

Run through each vector below. For each one, explain **how** it could be exploited and whether the current code is secure.

#### 9a — Direct Firestore REST API bypass

**Attack:** An attacker with a valid Firebase auth token crafts raw REST API calls to `https://firestore.googleapis.com/v1/projects/{projectId}/databases/(default)/documents/users/{VICTIM_UID}/...` to read or write another user's data.

**What secures it:** Firestore security rules run on every REST/SDK request. The `request.auth.uid == userId` rule prevents this.

**Verify:**

```powershell
# Confirm every allow rule has uid check — no exceptions:
Select-String -Path firestore.rules -Pattern 'allow' | ForEach-Object { $_.Line.Trim() }
```

#### 9b — Storage direct URL guessing

**Attack:** An attacker guesses or enumerates Storage paths like `users/{victimUid}/renovations/{id}/original.png` and tries to download via the Storage REST API.

**What secures it:** Storage rules require `request.auth.uid == userId`. Unauthenticated requests and cross-user requests are rejected.

**Verify:**

```powershell
Select-String -Path storage.rules -Pattern 'allow' | ForEach-Object { $_.Line.Trim() }
```

#### 9c — Cloud Function trigger injection

**Attack:** An attacker creates a document at `users/{victimUid}/renovations/{id}/impressions/{id}` via the Firestore API, hoping to trigger `processImpression` on someone else's behalf and have results written to the victim's storage.

**What secures it:** Firestore rules prevent writing to another user's path. The trigger only fires on documents that pass security rules first.

**Verify:**

```powershell
# Confirm the Cloud Function trigger path matches the Firestore rules path:
Select-String -Path functions/src/index.ts -Pattern 'document:.*users/\{userId\}'
Select-String -Path firestore.rules -Pattern 'match /users/\{userId\}'
```

#### 9d — Emulator test helpers exposed in production

**Attack:** If `__testSignIn`, `__testSignUp`, or `__testGetUid` window globals leak to production, an attacker could create arbitrary accounts or sign in without proper auth.

**What secures it:** These helpers are only attached when `VITE_USE_EMULATORS === "true"`, which is never set in production builds.

**Verify:**

```powershell
# Should only appear inside VITE_USE_EMULATORS guards:
Select-String -Path src/**/*.ts,src/**/*.vue -Pattern '__test' -Recurse
# Verify production build doesn't include emulator code:
Select-String -Path src/firebase.ts -Pattern 'VITE_USE_EMULATORS'
```

#### 9e — Image upload content-type spoofing

**Attack:** An attacker uploads a malicious file (e.g., HTML with XSS) disguised as an image to Storage, then tricks a victim into opening the download URL.

**What secures it:** Firebase Storage serves files with `Content-Disposition: attachment` by default for unknown types. The app only processes PNG images. The service worker only caches responses with `request.destination === "image"`.

**Verify:**

```powershell
# Check what content types the app accepts on upload:
Select-String -Path src/views/*.vue -Pattern 'contentType|accept=|\.type'
# Check Cloud Function processes only expected formats:
Select-String -Path functions/src/index.ts -Pattern 'contentType|image/png'
```

#### 9f — Prompt injection via impression prompt

**Attack:** An attacker submits a crafted `prompt` string to the impression document, attempting to inject instructions into the Gemini API call that exfiltrate data or cause unintended behavior.

**What secures it:** The Cloud Function constructs the Gemini prompt with a fixed template prefix (`"Edit the area highlighted in red: ${prompt}..."`). The response is expected to be an image. Text-only responses are explicitly rejected. Gemini's image generation mode limits the attack surface.

**Verify:**

```powershell
# Review prompt construction — ensure user input is sandwiched, not prepended:
Select-String -Path functions/src/index.ts -Pattern 'editPrompt|prompt'
# Confirm text-only responses are rejected:
Select-String -Path functions/src/index.ts -Pattern 'did not contain an image'
```

#### 9g — IDOR via route parameters

**Attack:** An authenticated user manipulates Vue Router params (e.g., changes `/renovation/:id` to another user's renovation ID) to access data they don't own.

**What secures it:** All Firestore reads in views/composables are scoped to `currentUser.value.uid`. Even if the route param `id` is someone else's renovation ID, the Firestore query path is `users/{MY_UID}/renovations/{id}`, which returns nothing (not the victim's data).

**Verify:**

```powershell
# Confirm all doc/collection references in views include the current user's uid:
Select-String -Path src/views/*.vue -Pattern 'doc\(db|collection\(db' | ForEach-Object { $_.Line.Trim() }
```

#### 9h — Cross-site scripting (XSS) via user-generated content

**Attack:** User-supplied strings (display name, prompt text, error messages) rendered in the UI without sanitization could execute scripts.

**What secures it:** Vue 3 auto-escapes all template interpolation (`{{ }}`). Only `v-html` would be dangerous.

**Verify:**

```powershell
# Should return NO matches — v-html with user content is dangerous:
Select-String -Path src/**/*.vue -Pattern 'v-html' -Recurse
```

#### 9i — Denial of service via large image uploads

**Attack:** An attacker uploads extremely large images to exhaust Storage quotas or Cloud Function memory/timeout.

**What secures it:** Storage rules could add `request.resource.size < maxSize`. Cloud Function has `memory: "512MiB"` and `timeoutSeconds: 120` limits.

**Verify:**

```powershell
# Check if storage rules enforce file size limits:
Select-String -Path storage.rules -Pattern 'size|contentType'
# Check Cloud Function resource limits:
Select-String -Path functions/src/index.ts -Pattern 'memory|timeout'
```

**Recommendation:** Add `request.resource.size < 10 * 1024 * 1024` (10MB) to storage rules if not present.

#### 9j — OAuth token reuse across environments

**Attack:** A token obtained from the sandbox project is used against the dev or production project.

**What secures it:** Firebase projects are completely isolated. Each project has its own auth database, Firestore, and Storage. A token for `prepaid-ai-sandbox` is not valid for `prepaid-ai-dev` or `prepaid-ai-production`.

**Verify:**

```powershell
# Confirm each environment uses a different project ID:
Get-Content terraform/environments/sandbox.tfvars | Select-String 'project_id'
Get-Content terraform/environments/dev.tfvars | Select-String 'project_id'
Get-Content terraform/environments/production.tfvars | Select-String 'project_id'
```

## Report Template

After running all phases, produce a report with:

| Category             | Status    | Details                          |
| -------------------- | --------- | -------------------------------- |
| Firestore Rules      | PASS/FAIL | Per-user isolation enforced      |
| Storage Rules        | PASS/FAIL | Per-user isolation enforced      |
| Cloud Functions      | PASS/FAIL | Trigger path scoped to userId    |
| Client Auth Guards   | PASS/FAIL | All routes protected             |
| Client Data Scoping  | PASS/FAIL | All queries use currentUser.uid  |
| Non-Prod Domain Lock | PASS/FAIL | @johangorter.com restriction     |
| Secrets Hygiene      | PASS/FAIL | No committed secrets             |
| Service Worker       | PASS/FAIL | No auth/data caching             |
| Billing Readiness    | N/A       | Not yet implemented              |
| Attack Vectors       | PASS/FAIL | All vectors secured or mitigated |

## Current Security Measures in Place

| Measure                                                     | Protects Against                             | Location                           |
| ----------------------------------------------------------- | -------------------------------------------- | ---------------------------------- |
| Firestore rules with `auth.uid == userId`                   | Cross-user data access via API               | `firestore.rules`                  |
| Storage rules with `auth.uid == userId`                     | Cross-user file access via API               | `storage.rules`                    |
| Vue Router `beforeEach` auth guard                          | Unauthenticated page access                  | `src/router/index.ts`              |
| Client-side `currentUser.uid` scoping                       | Client fetching wrong user's data            | `src/composables/*.ts`             |
| `onDocumentCreated` trigger path with `{userId}`            | Function processing wrong user's data        | `functions/src/index.ts`           |
| `beforeCreate` blocking function                            | Non-@johangorter.com sign-ups on sandbox/dev | `functions/src/index.ts`           |
| `ENVIRONMENT` env var per project                           | Blocking function knows which env it runs in | `functions/.env.prepaid-ai-*`      |
| Secret Manager for `GEMINI_API_KEY`                         | API key exposure                             | `terraform/.../main.tf`            |
| Terraform `sensitive = true` on OAuth secrets               | Secret leakage in plan output                | `terraform/variables.tf`           |
| `.gitignore` excludes `.env` and `*.auto.tfvars` files      | Credential commit to VCS                     | `.gitignore`                       |
| Emulator-only test helpers behind `VITE_USE_EMULATORS` flag | Test auth helpers in production              | `src/firebase.ts`                  |
| Firebase Hosting rewrites (SPA)                             | Direct file path traversal                   | `firebase.json`                    |
| Service worker caches only Storage images                   | Auth token leakage in cache                  | `src/sw.ts`                        |
| `persistentLocalCache` with `persistentMultipleTabManager`  | Offline Firestore stale data                 | `src/firebase.ts`                  |
| `localStorage` stores only download URL strings             | No tokens or auth data in local storage      | `src/composables/useStorageUrl.ts` |
| Vue 3 auto-escaping template interpolation                  | XSS via user-generated content               | All `.vue` files                   |
| Separate Firebase projects per environment                  | Cross-environment token reuse                | `terraform/environments/*.tfvars`  |
| Cloud Function memory + timeout limits                      | DoS via large image processing               | `functions/src/index.ts`           |

## Last Audit Results (baseline — 2026-03-31)

| Category             | Status   | Details                                                                                                   |
| -------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| Firestore Rules      | **PASS** | 3/3 `allow` blocks check `request.auth.uid == userId`. No wildcards or `if true`.                         |
| Storage Rules        | **PASS** | 1/1 `allow` block checks `request.auth.uid == userId`. No open paths.                                     |
| Cloud Functions      | **PASS** | `processImpression` trigger path scoped to `users/{userId}/...`. Result written under same uid prefix.    |
| Client Auth Guards   | **PASS** | 4 routes require auth, 1 (login) does not. `beforeEach` redirects unauthenticated.                        |
| Client Data Scoping  | **PASS** | 8 composable refs + 5 view refs use `currentUser.value.uid` / `user.uid`.                                 |
| Non-Prod Domain Lock | **PASS** | `beforeCreate` blocking function rejects non-`@johangorter.com` emails when `ENVIRONMENT !== production`. |
| Secrets Hygiene      | **PASS** | `sandbox.auto.tfvars` is git-ignored (not in source control). Terraform variables marked sensitive.       |
| Service Worker       | **PASS** | Only `GET image` requests to Firebase Storage are cached. No auth/Firestore/Functions traffic cached.     |
| localStorage         | **PASS** | Only `{storagePath: downloadURL}` string mappings stored. No tokens.                                      |
| Attack Vectors       | **PASS** | See Phase 9 details below.                                                                                |
| Billing Readiness    | **N/A**  | Not yet implemented. See Phase 8 for future checks.                                                       |

### Phase 9 Attack Vector Results

| Vector                          | Status       | Notes                                                                                                                            |
| ------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 9a — Firestore REST bypass      | **SECURE**   | Rules enforce `auth.uid == userId` on all paths                                                                                  |
| 9b — Storage URL guessing       | **SECURE**   | Rules enforce `auth.uid == userId`                                                                                               |
| 9c — Function trigger injection | **SECURE**   | Rules prevent cross-user writes; trigger only fires after rules pass                                                             |
| 9d — Emulator helpers in prod   | **SECURE**   | Gated behind `VITE_USE_EMULATORS` compile-time flag                                                                              |
| 9e — Content-type spoofing      | **LOW RISK** | Function writes `image/png` content type; SW only caches image destinations                                                      |
| 9f — Prompt injection           | **LOW RISK** | Gemini image mode limits surface; text-only responses rejected                                                                   |
| 9g — IDOR via route params      | **SECURE**   | All queries scoped to `currentUser.uid`, not route params alone                                                                  |
| 9h — XSS                        | **SECURE**   | No `v-html` usage; Vue 3 auto-escapes all interpolation                                                                          |
| 9i — DoS via large uploads      | **ADVISORY** | No Storage size limit in rules. Function has 512MiB/120s limits. Consider adding `request.resource.size < 10MB` to storage rules |
| 9j — Cross-env token reuse      | **SECURE**   | Separate Firebase projects with isolated auth databases                                                                          |

### Recommendations

1. **ADVISORY — Add Storage file size limit**: Add `request.resource.size < 10 * 1024 * 1024` to `storage.rules` to prevent oversized uploads.
