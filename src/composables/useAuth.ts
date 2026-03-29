import type { User } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { computed, ref, watch } from "vue";
import { db, firebaseApp } from "../firebase";

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
          photoURL: user.photoURL ?? "",
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
    const { GoogleAuthProvider, signInWithPopup, getAuth } = await import(
      "firebase/auth"
    );
    await signInWithPopup(getAuth(firebaseApp), new GoogleAuthProvider());
  }

  async function signInWithMicrosoft() {
    const { OAuthProvider, signInWithPopup, getAuth } = await import(
      "firebase/auth"
    );
    await signInWithPopup(
      getAuth(firebaseApp),
      new OAuthProvider("microsoft.com"),
    );
  }

  async function signInWithApple() {
    const { OAuthProvider, signInWithPopup, getAuth } = await import(
      "firebase/auth"
    );
    await signInWithPopup(
      getAuth(firebaseApp),
      new OAuthProvider("apple.com"),
    );
  }

  async function signOut() {
    const { signOut: firebaseSignOut, getAuth } = await import(
      "firebase/auth"
    );
    await firebaseSignOut(getAuth(firebaseApp));
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
