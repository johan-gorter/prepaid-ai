import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);

// Connect to Firebase emulators in local dev/test
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  Promise.all([
    import("firebase/auth"),
    import("firebase/firestore"),
  ]).then(([authModule, firestoreModule]) => {
    const auth = authModule.getAuth(firebaseApp);
    authModule.connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    firestoreModule.connectFirestoreEmulator(db, "127.0.0.1", 8080);

    // Expose a test helper so Playwright can sign in without bare module imports
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__testSignIn = (email: string, password: string) =>
      authModule.signInWithEmailAndPassword(auth, email, password);
  });
}
