# Prepaid AI — Project Setup Plan

## Architecture Decisions

| Concern       | Decision                                                                    |
| ------------- | --------------------------------------------------------------------------- |
| Frontend      | Vue 3 + Vite (PWA via vite-plugin-pwa)                                      |
| Auth          | Firebase Authentication (Google, Microsoft, Apple providers)                |
| Database      | Cloud Firestore                                                             |
| File Storage  | Firebase Storage (backed by GCS)                                            |
| AI Processing | Cloud Run service calling Nano Banana API                                   |
| Backend       | Cloud Functions (Firebase) for secure API calls & image processing triggers |
| Hosting       | Firebase Hosting                                                            |
| Secrets       | Local `.env` file (dev), GCP Secret Manager (prod)                          |

## Data Model (Firestore)

```
users/{uid}
  ├── displayName, email, photoURL, createdAt
  │
  ├── renovations/{renovationId}
  │     ├── title, createdAt, updatedAt
  │     ├── originalImageUrl (GCS path)
  │     │
  │     └── impressions/{impressionId}
  │           ├── sourceImageUrl (which version was used as input)
  │           ├── resultImageUrl (AI-generated output)
  │           ├── maskImageUrl (user-drawn mask)
  │           ├── prompt (text description of desired change)
  │           ├── status: "pending" | "processing" | "completed" | "failed"
  │           ├── createdAt
  │           └── error (optional, if failed)
```

## Step-by-Step Setup

### Phase 1: GCP & Firebase Project

1. Create a GCP project named `prepaid-ai` at console.cloud.google.com
2. Activate free trial ($300 credits / 90 days)
3. Enable Firebase on the same project at console.firebase.google.com
4. Select **Blaze plan** (pay-as-you-go — covered by GCP credits)
5. Enable Firestore (start in **test mode**, lock down later with security rules)
6. Enable Firebase Storage (default bucket)
7. Enable Firebase Authentication with providers:
   - Google (built-in, just enable)
   - Microsoft (register app in Azure AD, add client ID/secret)
   - Apple (register in Apple Developer portal, add service ID/key)

### Phase 2: Local Development Setup

8. Install Firebase CLI: `npm install -g firebase-tools`
9. `firebase login` and `firebase init` (select Firestore, Functions, Hosting, Storage)
10. Scaffold Vue project: `npm create vite@latest prepaid-ai -- --template vue-ts`
11. Install dependencies:
    ```bash
    npm install firebase vuefire vue-router pinia
    npm install -D vite-plugin-pwa
    ```
12. Create `.env` file (see below)
13. Configure `vite.config.ts` with PWA plugin and env variables
14. Set up Firebase SDK initialization using env variables

### Phase 3: Authentication

15. Implement Firebase Auth sign-in flows (Google/Microsoft/Apple)
16. Create auth composable (`useAuth`) with VueFire
17. Add route guards for authenticated pages
18. Write Firestore security rules scoped to `request.auth.uid`

### Phase 4: Core Features — Upload & Mask

19. Build camera/upload component (use `<input type="file" capture="environment">` for mobile)
20. Implement canvas-based mask drawing tool (coarse pointer for area selection)
21. Upload original image + mask to Firebase Storage under `users/{uid}/renovations/{id}/`
22. Create Firestore document for renovation and impression (status: "pending")

### Phase 5: AI Processing Pipeline

23. Create Cloud Function triggered on impression creation (Firestore `onCreate`)
24. Cloud Function workflow:
    - Download source image + mask from Firebase Storage
    - Call Nano Banana API with image, mask, and prompt
    - Upload result image to Firebase Storage
    - Update impression document: status → "completed", set `resultImageUrl`
    - On error: status → "failed", set `error`
25. Frontend listens to impression document (Firestore realtime) for status updates

### Phase 6: Iteration & History

26. Build impression gallery per renovation (timeline view)
27. Allow selecting any previous impression result as new source image
28. Repeat mask → prompt → generate flow from selected version

### Phase 7: PWA & Polish

29. Configure PWA manifest (icons, theme color, standalone display)
30. Add service worker for offline shell caching
31. Test install flow on iOS Safari and Android Chrome
32. Add loading states, error handling, image zoom/pan

### Phase 8: Production

33. Write proper Firestore security rules
34. Move secrets to GCP Secret Manager
35. Set up Firebase Hosting deploy: `firebase deploy`
36. Configure custom domain (optional)
37. Set up GCP billing alerts to monitor free credit usage

---

## Environment Variables (`.env`)

```bash
# ============================================
# Prepaid AI — Local Environment Variables
# ============================================
# DO NOT commit this file to version control.
# Add .env to .gitignore

# --- Firebase (client-side, VITE_ prefix required) ---
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=prepaid-ai.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=prepaid-ai
VITE_FIREBASE_STORAGE_BUCKET=prepaid-ai.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# --- Firebase Auth Providers ---
# Google: no extra config needed (uses Firebase project)
# Microsoft: Azure AD app credentials (configured in Firebase Console)
# Apple: configured in Firebase Console + Apple Developer Portal

# --- Nano Banana API (server-side only, used in Cloud Functions) ---
NANO_BANANA_API_KEY=nb_live_...
NANO_BANANA_API_URL=https://api.nanobanana.com/v1/inpaint

# --- Cloud Functions local emulator (optional) ---
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
```

### Notes on secrets

- `VITE_` prefixed vars are bundled into the client — these are **public** Firebase config values (safe to expose, secured by Firestore rules + Auth)
- `NANO_BANANA_API_KEY` is **private** — only used in Cloud Functions, never exposed to the client
- In production, store `NANO_BANANA_API_KEY` in **GCP Secret Manager** and access it from Cloud Functions via `defineSecret()`
- Firebase client config values don't need Secret Manager — they're public by design
