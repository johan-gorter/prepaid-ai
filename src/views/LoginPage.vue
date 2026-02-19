<script setup lang="ts">
import { signInWithEmailAndPassword } from "firebase/auth";
import { useAuth } from "../composables/useAuth";
import { auth } from "../firebase";
import { useRouter } from "vue-router";

const { signInWithGoogle, signInWithMicrosoft, signInWithApple, loading } =
  useAuth();
const router = useRouter();

const isEmulatorMode = import.meta.env.VITE_USE_EMULATORS === "true";

// Dev login credentials — matches the user created by `npm run emulators:seed`
const DEV_EMAIL = "dev@renovision.test";
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
    await signInWithEmailAndPassword(auth, DEV_EMAIL, DEV_PASSWORD);
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
  <div class="login-page">
    <div class="login-card">
      <div class="logo">
        <h1>🏠 RenovisionAI</h1>
        <p class="tagline">Reimagine your space with AI</p>
      </div>

      <div class="providers">
        <button
          class="btn btn-google"
          @click="handleSignIn('google')"
          :disabled="loading"
        >
          <span class="icon">G</span>
          Sign in with Google
        </button>
        <button
          class="btn btn-microsoft"
          @click="handleSignIn('microsoft')"
          :disabled="loading"
        >
          <span class="icon">M</span>
          Sign in with Microsoft
        </button>
        <button
          class="btn btn-apple"
          @click="handleSignIn('apple')"
          :disabled="loading"
        >
          <span class="icon">A</span>
          Sign in with Apple
        </button>
      </div>

      <!-- Dev login panel — only rendered when running with emulators -->
      <div v-if="isEmulatorMode" class="dev-panel">
        <div class="dev-divider">
          <span>🧪 Dev / Emulator mode</span>
        </div>
        <p class="dev-hint">
          Run <code>npm run emulators:seed</code> once to create this user.
        </p>
        <button class="btn btn-dev" @click="handleDevLogin">
          <span class="icon">⚡</span>
          Dev Login ({{ DEV_EMAIL }})
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  padding: 1rem;
}

.login-card {
  background: #fff;
  border-radius: 1rem;
  padding: 2.5rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.logo {
  text-align: center;
  margin-bottom: 2rem;
}

.logo h1 {
  font-size: 1.75rem;
  color: #1a1a2e;
  margin: 0;
}

.tagline {
  color: #666;
  margin-top: 0.5rem;
  font-size: 0.95rem;
}

.providers {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #ddd;
  font-size: 1rem;
  cursor: pointer;
  transition:
    background-color 0.2s,
    transform 0.1s;
  background: #fff;
  color: #333;
}

.btn:hover {
  background: #f5f5f5;
  transform: translateY(-1px);
}

.btn:active {
  transform: translateY(0);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  font-weight: 700;
  border-radius: 0.25rem;
}

.btn-google .icon {
  color: #4285f4;
}
.btn-microsoft .icon {
  color: #00a4ef;
}
.btn-apple .icon {
  color: #000;
}

/* Dev panel — only visible in emulator mode */
.dev-panel {
  margin-top: 1.5rem;
}

.dev-divider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  color: #999;
  font-size: 0.8rem;
}

.dev-divider::before,
.dev-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: #eee;
}

.dev-hint {
  font-size: 0.8rem;
  color: #888;
  margin: 0 0 0.75rem;
  text-align: center;
}

.dev-hint code {
  background: #f5f5f5;
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.9em;
}

.btn-dev {
  background: #fff8e1;
  border-color: #ffe082;
  color: #5d4037;
  width: 100%;
}

.btn-dev:hover {
  background: #fff3cd;
}
</style>
