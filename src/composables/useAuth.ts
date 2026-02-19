import {
  GoogleAuthProvider,
  OAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { computed, ref } from "vue";
import { auth, db } from "../firebase";

const currentUser = ref<User | null>(null);
const loading = ref(true);

// Listen to auth state once
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

export function useAuth() {
  const isAuthenticated = computed(() => !!currentUser.value);

  async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }

  async function signInWithMicrosoft() {
    const provider = new OAuthProvider("microsoft.com");
    await signInWithPopup(auth, provider);
  }

  async function signInWithApple() {
    const provider = new OAuthProvider("apple.com");
    await signInWithPopup(auth, provider);
  }

  async function signOut() {
    await firebaseSignOut(auth);
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
