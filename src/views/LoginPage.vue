<script setup lang="ts">
import { useAuth } from "../composables/useAuth";
import { firebaseApp } from "../firebase";
import { useRouter } from "vue-router";

const { signInWithGoogle, signInWithMicrosoft, signInWithApple, loading } =
  useAuth();
const router = useRouter();

const isEmulatorMode = import.meta.env.VITE_USE_EMULATORS === "true";

// Dev login credentials — matches the user created by `npm run emulators:seed`
const DEV_EMAIL = "dev@prepaid.test";
const DEV_PASSWORD = "dev-password";

async function handleSignIn(provider: "google" | "microsoft" | "apple") {
  try {
    if (provider === "google") await signInWithGoogle();
    else if (provider === "microsoft") await signInWithMicrosoft();
    else await signInWithApple();

    const redirect =
      (router.currentRoute.value.query.redirect as string) || "/";
    router.push(redirect);
  } catch (err) {
    console.error("Sign-in error:", err);
  }
}

async function handleDevLogin() {
  try {
    const { signInWithEmailAndPassword, getAuth } = await import(
      "firebase/auth"
    );
    await signInWithEmailAndPassword(
      getAuth(firebaseApp),
      DEV_EMAIL,
      DEV_PASSWORD,
    );
    const redirect =
      (router.currentRoute.value.query.redirect as string) || "/";
    router.push(redirect);
  } catch (err) {
    console.error("Dev login failed:", err);
    alert(
      `Dev login failed.\n\nMake sure you have run:\n  npm run emulators:seed`,
    );
  }
}
</script>

<template>
  <body class="dark">
    <main class="responsive" style="max-width: 400px; margin: 0 auto; padding-top: 15vh;">
      <article class="round large-elevate">
        <div class="center-align">
          <h4>Prepaid AI</h4>
          <p class="small-text">Reimagine your space with AI</p>
        </div>

        <div class="space"></div>

        <button class="responsive border" @click="handleSignIn('google')" :disabled="loading">
          <span class="bold">G</span>
          <span>Sign in with Google</span>
        </button>
        <div class="small-space"></div>
        <button class="responsive border" @click="handleSignIn('microsoft')" :disabled="loading">
          <span class="bold">M</span>
          <span>Sign in with Microsoft</span>
        </button>
        <div class="small-space"></div>
        <button class="responsive border" @click="handleSignIn('apple')" :disabled="loading">
          <span class="bold">A</span>
          <span>Sign in with Apple</span>
        </button>

        <!-- Dev login panel — only rendered when running with emulators -->
        <template v-if="isEmulatorMode">
          <div class="divider" style="margin-top: 1.5rem;"></div>
          <p class="center-align small-text">Dev / Emulator mode</p>
          <p class="center-align small-text">
            Run <code>npm run emulators:seed</code> once to create this user.
          </p>
          <button class="responsive amber-container" @click="handleDevLogin">
            <i>bolt</i>
            <span>Dev Login ({{ DEV_EMAIL }})</span>
          </button>
        </template>
      </article>
    </main>
  </body>
</template>
