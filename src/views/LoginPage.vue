<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { firebaseApp } from "../firebase";

const { signInWithGoogle, signInWithMicrosoft, signInWithApple, loading } =
  useAuth();
const router = useRouter();

const isEmulatorMode = import.meta.env.VITE_USE_EMULATORS === "true";

const errorMessage = ref<string | null>(null);

// Dev login credentials — matches the user created by `npm run emulators:seed`
const DEV_EMAIL = "dev@prepaid.test";
const DEV_PASSWORD = "dev-password";

async function handleSignIn(provider: "google" | "microsoft" | "apple") {
  errorMessage.value = null;
  try {
    if (provider === "google") await signInWithGoogle();
    else if (provider === "microsoft") await signInWithMicrosoft();
    else await signInWithApple();

    const redirect =
      (router.currentRoute.value.query.redirect as string) || "/";
    router.push(redirect);
  } catch (err) {
    console.error("Sign-in error:", err);
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code: string }).code
        : "";
    if (code === "auth/account-exists-with-different-credential") {
      errorMessage.value =
        "An account already exists with this email address using a different " +
        "sign-in method. Please sign in with the method you used originally.";
    } else if (
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request"
    ) {
      // User dismissed the popup themselves — no need to alarm them.
      errorMessage.value = null;
    } else {
      errorMessage.value = "Sign-in failed. Please try again.";
    }
  }
}

async function handleDevLogin() {
  try {
    const { signInWithEmailAndPassword, getAuth } =
      await import("firebase/auth");
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
  <main
    class="responsive"
    style="max-width: 400px; margin: 0 auto; padding-top: 15vh"
  >
    <article class="round large-elevate">
      <div class="center-align">
        <h4>payasyougo.app</h4>
        <p class="small-text">Reimagine your space with AI</p>
      </div>

      <div class="space"></div>

      <button
        class="responsive border"
        @click="handleSignIn('google')"
        :disabled="loading"
        aria-label="Sign in with Google"
      >
        <span class="bold" aria-hidden="true">G</span>
        <span>Sign in with Google</span>
      </button>
      <div class="small-space"></div>
      <button
        class="responsive border"
        @click="handleSignIn('microsoft')"
        :disabled="loading"
        aria-label="Sign in with Microsoft"
      >
        <span class="bold" aria-hidden="true">M</span>
        <span>Sign in with Microsoft</span>
      </button>
      <!-- Apple sign-in temporarily disabled until the Apple Developer
           credentials are configured (Services ID + signing key). The
           provider plumbing (useAuth.signInWithApple, Terraform idp config)
           is still in place — just re-enable this button when ready. -->
      <!-- <div class="small-space"></div>
      <button
        class="responsive border"
        @click="handleSignIn('apple')"
        :disabled="loading"
        aria-label="Sign in with Apple"
      >
        <span class="bold" aria-hidden="true">A</span>
        <span>Sign in with Apple</span>
      </button> -->

      <p
        v-if="errorMessage"
        class="error-text center-align small-text"
        style="margin-top: 1rem"
        role="alert"
        data-testid="login-error"
      >
        {{ errorMessage }}
      </p>

      <p class="center-align small-text" style="margin-top: 1rem">
        By signing in, you agree to our
        <router-link to="/about">Terms of Service</router-link>.
      </p>

      <!-- Dev login panel — only rendered when running with emulators -->
      <template v-if="isEmulatorMode">
        <div class="divider" style="margin-top: 1.5rem"></div>
        <p class="center-align small-text">Dev / Emulator mode</p>
        <p class="center-align small-text">
          Run <code>npm run emulators:seed</code> once to create this user.
        </p>
        <button class="responsive amber-container" @click="handleDevLogin">
          <i aria-hidden="true">bolt</i>
          <span>Dev Login ({{ DEV_EMAIL }})</span>
        </button>
      </template>
    </article>
  </main>
</template>
