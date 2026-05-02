import type { User } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { computed, ref, watch } from "vue";
import { db, firebaseApp } from "../firebase";
import { idbClearAll } from "./useIdbStorage";
import { resetStorageUrlCaches } from "./useStorageUrl";

const currentUser = ref<User | null>(null);
const loading = ref(true);

// Lazy-load Firebase Auth — keeps ~250 kB out of the initial bundle
import("firebase/auth").then(({ getAuth, onAuthStateChanged }) => {
  const auth = getAuth(firebaseApp);
  onAuthStateChanged(auth, async (user) => {
    currentUser.value = user;
    loading.value = false;

    if (user) {
      // Upsert user profile in Firestore
      const userRef = doc(db, "users", user.uid);
      await setDoc(
        userRef,
        {
          displayName: user.displayName ?? "",
          email: user.email ?? "",
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
    }
  });
});

/** Resolves once the initial auth state is known. Replaces vuefire's getCurrentUser(). */
export function getCurrentUser(): Promise<User | null> {
  return new Promise((resolve) => {
    if (!loading.value) {
      resolve(currentUser.value);
      return;
    }
    const unwatch = watch(loading, (isLoading) => {
      if (!isLoading) {
        unwatch();
        resolve(currentUser.value);
      }
    });
  });
}

// Expose test helper so Playwright can wait for Vue-side auth state
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__testAuthReady = () =>
    getCurrentUser().then((u) => u?.uid ?? null);
}

export function useAuth() {
  const isAuthenticated = computed(() => !!currentUser.value);

  async function signInWithGoogle() {
    const { GoogleAuthProvider, signInWithPopup, getAuth } =
      await import("firebase/auth");
    await signInWithPopup(getAuth(firebaseApp), new GoogleAuthProvider());
  }

  async function signInWithMicrosoft() {
    const { OAuthProvider, signInWithPopup, getAuth } =
      await import("firebase/auth");
    await signInWithPopup(
      getAuth(firebaseApp),
      new OAuthProvider("microsoft.com"),
    );
  }

  async function signInWithApple() {
    const { OAuthProvider, signInWithPopup, getAuth } =
      await import("firebase/auth");
    await signInWithPopup(getAuth(firebaseApp), new OAuthProvider("apple.com"));
  }

  async function signOut() {
    const { signOut: firebaseSignOut, getAuth } = await import("firebase/auth");
    await firebaseSignOut(getAuth(firebaseApp));
    // Wipe app-managed local state so a different user on the same device
    // can't recover the previous session's chat draft, prompt, mask, or
    // pending purchase. We clear in three layers:
    //   1. In-memory module caches (resolved Storage URLs, in-flight
    //      requests) — otherwise the next persist call on the new user
    //      would re-write the previous user's URL map back to disk.
    //   2. localStorage — defence-in-depth for users with pre-IDB
    //      builds whose old keys would otherwise persist forever.
    //   3. IndexedDB — the unified `payasyougo` store plus any legacy
    //      databases earlier builds wrote into.
    resetStorageUrlCaches();
    try {
      localStorage.clear();
    } catch {
      // ignore: localStorage may be unavailable in some browser modes
    }
    await idbClearAll();
  }

  return {
    currentUser,
    loading,
    isAuthenticated,
    signInWithGoogle,
    signInWithMicrosoft,
    signInWithApple,
    signOut,
  };
}
