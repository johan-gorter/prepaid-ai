# Plan: Share a newly-created impression via a public link

## Context

Today, every impression lives under `users/{uid}/renovations/.../impressions/{id}` and is readable only by its owner (Firestore + Storage rules enforce this). There is no way for a user to show their generated result to someone who is not logged in.

We want the creator to share a single, stable URL per impression. A recipient opening the link sees the result image without signing in, can paint a mask + write a prompt on top of it, and is funneled into the normal "buy credits / sign up" flow when they hit Generate. Each impression has exactly one share link that is reused on subsequent Share clicks.

## Decisions captured

- **Share button placement:** only in the **NewImpressionPage preview-stage footer**, visible when the creator is looking at their just-generated impression (`stage === 'preview'` and `sourceParam === 'impression'` and the impression is owned by the current user).
- **What the recipient sees:** the **result image only** — no prompt, no "before" image. We deliberately do not denormalize the prompt into the public share doc.
- **URL:** `https://payasyougo.app/share/:token` (a top-level public route).
- **Reuse:** the share token is persisted on the impression document; clicking Share again returns the same token.
- **Revocation:** not in scope for v1. If the impression is deleted, the share doc is deleted too (so the link 404s).

## URLs involved

| URL | Audience | Behaviour |
| --- | --- | --- |
| `/share/:token` | Anyone (incl. anonymous) | Mounts `NewImpressionPage` with `source === 'share'`. Fetches `shares/{token}`, downloads the result image, drops it into the wizard as the source. Starts at `stage === 'preview'`. |
| `/new-impression?source=share` *(internal)* | n/a | The wizard treats this as a special-case source. We map `/share/:token` to this internally by storing the token on `route.params.token` and reading it in the wizard. |
| `/buy-credits?redirect=/share/:token` | Authenticated recipient with no credits | Existing redirect-after-purchase flow — already handled by the wizard's `persistDraft()` → `/buy-credits?redirect=…` branch. No change needed. |
| `/login?redirect=/share/:token` | Anonymous recipient hitting Generate | Existing redirect-after-login flow via `LoginPage`. No change needed. |

## Security model

Public data is intentionally minimal and is reachable only by guessing a 128-bit random token.

**New top-level Firestore collection: `shares/{token}`**

```
{
  ownerUid: string,
  resultImageUrl: string,   // Firebase Storage download URL (embeds an unguessable token)
  createdAt: Timestamp,
}
```

We use the embedded-token download URL (returned by `getDownloadURL()` on the result image) so the recipient can fetch the image bytes without a Storage rule change. The URL bypasses Storage rules but is itself a long, unguessable secret; it is only exposed to clients that already know the share token.

**Firestore rules additions** (`firestore.rules`):

```
match /shares/{token} {
  allow get: if true;
  allow list: if false;
  allow create: if request.auth != null
    && request.resource.data.ownerUid == request.auth.uid
    && request.resource.data.keys().hasOnly(['ownerUid', 'resultImageUrl', 'createdAt']);
  allow delete: if request.auth != null && resource.data.ownerUid == request.auth.uid;
  allow update: if false;
}
```

`allow list: if false` prevents enumeration. `allow get: if true` makes single-document reads-by-token public.

**Storage rules:** no changes. Bypass is via the download URL token only.

**Threat model summary:**
- Token guessing — 128-bit token, infeasible.
- Cross-user data leakage — share doc contains only the public URL + `ownerUid`; no private user data.
- Owner cleanup — `deleteImpression` / `deleteRenovation` in `useRenovations.ts` also delete the share doc (see Cleanup below).
- Revocation — out of scope; documented as a follow-up. (To revoke later we'd need to also rotate the Storage download token via the Admin SDK.)

## Critical files to modify

### Create

- **`src/views/NewImpressionPage.vue`** — add share-button + share-dialog UI in preview-stage footer; add `source === 'share'` handling in `initFromRoute`.
- **`src/composables/useShare.ts`** *(new)* — `createOrGetShareToken(renovationId, impressionId)` and `fetchShare(token)`. Encapsulates Firestore reads/writes for the `shares/{token}` collection and the `shareToken` field on impressions.
- **`src/components/ShareDialog.vue`** *(new)* — small modal with the share URL and a Copy button (uses `navigator.clipboard.writeText`, falls back to a hidden `<input>` + `select()`).

### Modify

- **`src/router/index.ts`** — add `{ path: '/share/:token', name: 'share', component: () => import('../views/NewImpressionPage.vue'), meta: { requiresAuth: false } }`.
- **`src/types.ts`** — add `shareToken?: string` to `Impression`. Add `Share` interface (`ownerUid`, `resultImageUrl`, `createdAt`).
- **`src/composables/useRenovations.ts`** — in `deleteImpression`, read `shareToken` from the impression and `deleteDoc(doc(db, 'shares', shareToken))` before deleting the impression doc. In `deleteRenovation`, do the same for every impression in the loop.
- **`firestore.rules`** — append the `shares/{token}` block shown above.

## Wizard changes in detail (`NewImpressionPage.vue`)

1. **Type:** widen `Source` to `"photo" | "crop" | "original" | "impression" | "share"`.

2. **Token source:** add `const shareToken = computed(() => route.params.token as string | undefined)`. When this is set we override `sourceParam` to `'share'`.

3. **`initFromRoute` branch for `source === 'share'`:**
   - Call `fetchShare(token)` → `{ resultImageUrl }`. If missing, set `errorMessage = "Share link not found"` and return.
   - `await clearImpressionSource(); clearImpressionMask(); clearImpressionDraft();` to avoid leaking state from a previous device session.
   - `fetch(resultImageUrl) → blob → setImpressionSource(blob)`.
   - Set `sourceObjectUrl = URL.createObjectURL(blob)`, `stage = 'preview'`.

4. **`onGenerate` for `source === 'share'`:**
   - Re-use the existing `source === 'photo' / 'crop'` branch (lines 406–413 of the current file): upload the IDB blob to `users/{uid}/originals/{ts}.webp`, create a new renovation, then proceed. No code-path duplication needed — just add `'share'` to the same branch condition.

5. **Preview-stage footer — add Share button:**
   - Only render the button when `sourceParam === 'impression'`, `renovationParam && impressionParam` are set, **and** the impression owner is the current user (always true under the current rules — we only need the `impression` source guard, since anonymous recipients are on `source === 'share'`).
   - On click: `const token = await createOrGetShareToken(renovationParam.value, impressionParam.value)` → open `<ShareDialog>` with `https://${location.host}/share/${token}`.

6. **`onNextChange` already handles the transition from preview → mask**, so the recipient's "make my own change" path needs no new code: their share-preview view shows the existing "Next Change" button which moves them to the mask stage.

## `useShare.ts` (new composable)

```
import { addDoc, collection, doc, getDoc, getDocs, query, where, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';

export async function createOrGetShareToken(renovationId, impressionId) {
  // 1. Read impression doc; if shareToken exists, return it.
  // 2. Else: getDownloadURL(resultImagePath) -> resultImageUrl
  //         token = crypto.randomUUID().replace(/-/g, '')
  //         await setDoc(doc(db, 'shares', token), { ownerUid, resultImageUrl, createdAt: serverTimestamp() })
  //         await updateDoc(impressionRef, { shareToken: token })
  //         return token
}

export async function fetchShare(token) {
  const snap = await getDoc(doc(db, 'shares', token));
  return snap.exists() ? snap.data() : null;
}

export async function deleteShareForImpression(uid, renovationId, impressionId) {
  // Read shareToken from impression; if set, deleteDoc(doc(db, 'shares', token)).
}
```

`crypto.randomUUID()` provides ~122 bits of entropy — sufficient. Using the UUID hex without dashes gives a clean 32-char token.

## Cleanup flow

- **Impression delete (`useRenovations.deleteImpression`)** — before `deleteDoc(impressionDocRef)`, call `deleteShareForImpression(uid, renovationId, impressionId)`. Wrap in `Promise.allSettled` like the existing storage deletions so a missing share doc doesn't break delete.
- **Renovation delete (`useRenovations.deleteRenovation`)** — inside the existing per-impression loop, add the same `deleteShareForImpression` call before deleting the impression doc.
- **Account delete** — `functions/src/deleteUserAccount.ts` already iterates a user's data; documented as a follow-up if it doesn't currently catch the new `shares` collection (out of v1 scope per user's framing, but call out in PR description).

## Verification

E2E (`e2e/specs/share.spec.ts`, new file):

1. **Creator path** — using `authenticatedPage`, drive the wizard end-to-end: photo → mask → prompt → Generate, wait for completion, land on preview stage, click `Share`, assert the dialog appears, assert the URL matches `/share/[0-9a-f]{32}$/`, assert `shares/{token}` exists in Firestore (read via emulator REST API or the in-page SDK).
2. **Recipient path (anonymous)** — open the share URL in a brand-new browser context (no auth fixture). Assert the result image renders (use `getByAltText('Result')` once we keep that marker for preview too, or add a `data-testid="share-preview-image"`). Click `Next Change`, paint a mask, type a prompt, hit Generate, assert redirect to `/buy-credits` then `/login`.
3. **Reuse** — call Share twice on the same impression, assert the same token comes back both times.
4. **Cleanup** — delete the impression, assert `shares/{token}` is gone and `/share/{token}` shows the "not found" state.

Component test (`ct/share-dialog.ct.ts`, new file): mount `ShareDialog` with a fake URL, assert Copy button writes to the clipboard mock.

Manual / browser-devtools sanity (optional but recommended given the cross-domain image fetch): run `services:start dev:emulators`, log in, create an impression, click Share, open the link in an Incognito window, confirm the image renders and Generate behaves as expected.

Run sequence:

```
npm -s run services:start emulators dev:emulators
npm -s run services:wait emulators dev:emulators
npm -s run test:ct
npm -s run test:e2e -- e2e/specs/share.spec.ts
```

Type check: `npm -s run typecheck:all`.

## Out of scope (mentioned for clarity, not implemented)

- Share revocation / token rotation.
- `deleteUserAccount` cleanup of `shares/*` (only matters if a user deletes their account while shares still exist — owner data is already gone so the share would 404 on the image anyway).
- Web Share API / QR code in the share dialog.
- Per-share analytics or expiry.
