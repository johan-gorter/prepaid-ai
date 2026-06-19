<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import LegalFooter from "../components/LegalFooter.vue";
import { useAuth } from "../composables/useAuth";
import { track } from "../composables/useTrack";
import { firebaseApp } from "../firebase";

const { t } = useI18n();
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

    track("login_done");
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
      errorMessage.value = t("login.errorAccountExists");
    } else if (
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request"
    ) {
      // User dismissed the popup themselves — no need to alarm them.
      errorMessage.value = null;
    } else {
      errorMessage.value = t("login.errorGeneric");
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
    track("login_done");
    const redirect =
      (router.currentRoute.value.query.redirect as string) || "/";
    router.push(redirect);
  } catch (err) {
    console.error("Dev login failed:", err);
    alert(t("login.devLoginFailed"));
  }
}
</script>

<template>
  <main
    class="responsive"
    style="max-width: 400px; margin: 0 auto; padding-top: 15vh"
  >
    <article class="large-elevate border">
      <div class="center-align">
        <h4>payasyougo.app</h4>
        <p class="small-text">{{ $t("login.accountReassurance") }}</p>
      </div>

      <div class="space"></div>

      <button
        class="responsive border"
        @click="handleSignIn('google')"
        :disabled="loading"
        :aria-label="$t('login.withGoogle')"
      >
        <span class="bold" aria-hidden="true">G</span>
        <span>{{ $t("login.withGoogle") }}</span>
      </button>
      <div class="small-space"></div>
      <button
        class="responsive border"
        @click="handleSignIn('microsoft')"
        :disabled="loading"
        :aria-label="$t('login.withMicrosoft')"
      >
        <span class="bold" aria-hidden="true">M</span>
        <span>{{ $t("login.withMicrosoft") }}</span>
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

      <i18n-t
        keypath="login.termsPrefix"
        tag="p"
        class="center-align small-text"
        style="margin-top: 1rem"
      >
        <template #terms>
          <router-link to="/terms">{{ $t("login.termsLink") }}</router-link>
        </template>
        <template #privacy>
          <router-link to="/privacy">{{ $t("login.privacyLink") }}</router-link>
        </template>
      </i18n-t>

      <!-- Dev login panel — only rendered when running with emulators -->
      <template v-if="isEmulatorMode">
        <div class="divider" style="margin-top: 1.5rem"></div>
        <p class="center-align small-text">{{ $t("login.devMode") }}</p>
        <i18n-t keypath="login.devSeedHint" tag="p" class="center-align small-text">
          <template #command><code>npm run emulators:seed</code></template>
        </i18n-t>
        <button class="responsive amber-container" @click="handleDevLogin">
          <i aria-hidden="true">bolt</i>
          <span>{{ $t("login.devLogin", { email: DEV_EMAIL }) }}</span>
        </button>
      </template>
    </article>

    <LegalFooter />
  </main>
</template>
