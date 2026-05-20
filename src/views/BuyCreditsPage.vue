<script setup lang="ts">
import { httpsCallable } from "firebase/functions";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppBar from "../components/AppBar.vue";
import { useAuth } from "../composables/useAuth";
import {
  clearPendingPurchase,
  getPendingPurchase,
  setPendingPurchase,
} from "../composables/usePendingPurchase";
import { creditsToUsd } from "../credits";
import { functions } from "../firebase";

const route = useRoute();
const router = useRouter();
const { currentUser } = useAuth();

const PRESETS = [75, 200, 500] as const;
const MIN_CUSTOM = 75;
const MAX_CUSTOM = 10000;
const DEFAULT_CUSTOM = 1000;

const customAmount = ref(DEFAULT_CUSTOM);
const isProcessing = ref(false);
const errorMessage = ref<string | null>(null);

const isEmulatorMode = import.meta.env.VITE_USE_EMULATORS === "true";

const minCredits = computed(() => Number(route.query.min ?? 0) || 0);
const maxCredits = computed(() => Number(route.query.max ?? 0) || 0);

/**
 * Same-origin path the user should land on after a successful purchase.
 * Vue Router types `route.query.redirect` as `string | string[] | null`,
 * and we want to refuse arrays, foreign-origin URLs, and `javascript:`
 * payloads even if a stray link happens to include them.
 */
const redirectTo = computed(() => {
  const raw = route.query.redirect;
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (
    typeof candidate === "string" &&
    candidate.startsWith("/") &&
    !candidate.startsWith("//")
  ) {
    return candidate;
  }
  return "/";
});

/**
 * Lower bound for the custom-amount input. The page is invoked by a flow
 * that already knows the user needs at least `minCredits` to unblock the
 * pending action, so let the smaller of the two limits win — but never
 * dip below MIN_CUSTOM so we don't let the price tier go absurdly small.
 */
const effectiveMinCustom = computed(() =>
  Math.max(MIN_CUSTOM, minCredits.value),
);

const costMessage = computed(() => {
  // Tolerate callers that flip min/max (e.g. a chat turn whose minCost
  // exceeds the per-message ceiling) so the banner never reads
  // "between {larger} and {smaller}".
  const lo = Math.min(minCredits.value, maxCredits.value);
  const hi = Math.max(minCredits.value, maxCredits.value);
  if (!lo && !hi) return null;
  const loUsd = creditsToUsd(lo).toFixed(2);
  const hiUsd = creditsToUsd(hi).toFixed(2);
  if (lo === hi) {
    return `This operation costs ${lo} credits ($${loUsd}). You must buy credits in order to proceed.`;
  }
  return `This operation costs between ${lo} and ${hi} credits ($${loUsd} – $${hiUsd}). You must buy credits in order to proceed.`;
});

const customAmountValid = computed(
  () =>
    Number.isInteger(customAmount.value) &&
    customAmount.value >= effectiveMinCustom.value &&
    customAmount.value <= MAX_CUSTOM,
);

async function tryResumePending() {
  const pending = await getPendingPurchase();
  if (!pending) return;
  customAmount.value = pending.credits;
  // Auto-resume only when the post-login detour brought us back here. A
  // user who navigated to /buy-credits manually shouldn't have a stale
  // intent silently fire on them — and re-firing on every visit would
  // also overwrite `pending.redirect` with whatever the URL currently
  // says (which could legitimately differ from what was saved).
  const isResume = route.query.resume === "1";
  if (isResume && currentUser.value && !isProcessing.value) {
    await runCheckout(pending.credits, pending.redirect);
  }
}

onMounted(tryResumePending);

watch(
  () => currentUser.value?.uid,
  (uid, oldUid) => {
    if (uid && uid !== oldUid) {
      void tryResumePending();
    }
  },
);

/**
 * Run a checkout against an explicit (already-persisted) intent. Used by
 * `tryResumePending` so the saved redirect from the original buy click
 * isn't overwritten by whatever query happens to be on the URL now.
 */
async function runCheckout(credits: number, redirect: string) {
  if (isProcessing.value) return;
  errorMessage.value = null;
  isProcessing.value = true;

  try {
    if (!currentUser.value) {
      // Sign in first; the login page returns us to /buy-credits with a
      // resume=1 flag so the watcher below picks the intent back up.
      router.push({
        path: "/login",
        query: {
          redirect: `/buy-credits?resume=1&min=${minCredits.value}&max=${maxCredits.value}&redirect=${encodeURIComponent(redirect)}`,
        },
      });
      return;
    }

    if (isEmulatorMode) {
      // Dummy implementation: skip the payment provider entirely and
      // credit the balance via a Cloud Function, then re-enter the site
      // via a full page reload — mirroring production where Stripe's
      // off-site redirect navigates the browser back to the origin.
      // Doing this with `window.location` rather than `router.replace`
      // keeps the dummy honest: the chat draft has to survive a real
      // reload, not just an SPA navigation.
      const purchase = httpsCallable<
        { amount: number; idempotencyKey: string },
        { amount: number; newBalance: number }
      >(functions, "purchaseCredits");
      const idempotencyKey = newIdempotencyKey();
      await purchase({ amount: credits, idempotencyKey });
      await clearPendingPurchase();
      window.location.href = redirect;
      return;
    }

    // Production: hand off to Stripe Checkout.
    const createCheckoutSession = httpsCallable<
      { credits: number; successUrl: string; cancelUrl: string },
      { url: string }
    >(functions, "createCheckoutSession");
    const origin = window.location.origin;
    const successUrl = `${origin}/balance/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/buy-credits`;
    const result = await createCheckoutSession({
      credits,
      successUrl,
      cancelUrl,
    });
    await clearPendingPurchase();
    window.location.href = result.data.url;
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : "Failed to start checkout";
    // Drop the saved intent so a returning user isn't trapped in an
    // auto-fire loop replaying the same failure on every /buy-credits
    // visit. They can pick an amount again to retry.
    await clearPendingPurchase();
  } finally {
    isProcessing.value = false;
  }
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for ancient browsers — collision-resistant enough for the
  // purposes of de-duping a single user's retries.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function startCheckout(credits: number) {
  // Persist the intent first so a sign-in detour or a tab refresh after
  // the user picks an amount can resume from the same place.
  await setPendingPurchase({ credits, redirect: redirectTo.value });
  await runCheckout(credits, redirectTo.value);
}

function buyCustom() {
  if (!customAmountValid.value) return;
  void startCheckout(customAmount.value);
}
</script>

<template>
  <AppBar title="Buy Credits" />

  <main
    class="responsive"
    style="
      max-width: 600px;
      margin: 0 auto;
      padding-top: var(--app-bar-clearance);
    "
  >
    <div class="center-align" style="padding: 1.5rem 0 1rem">
      <i class="extra primary-text" style="font-size: 3rem">savings</i>
      <h4>Buy credits</h4>
    </div>

    <article
      v-if="costMessage"
      class="round border"
      style="
        margin-bottom: 1.5rem;
        border-left: 4px solid var(--primary, #006b3e);
      "
      data-testid="buy-credits-cost-message"
    >
      <p>{{ costMessage }}</p>
    </article>

    <p v-if="errorMessage" class="error-text" data-testid="buy-credits-error">
      {{ errorMessage }}
    </p>

    <h6>Choose an amount</h6>
    <div class="preset-grid">
      <button
        v-for="preset in PRESETS"
        :key="preset"
        class="responsive small-round"
        :disabled="isProcessing || preset < effectiveMinCustom"
        :data-testid="`buy-credits-preset-${preset}`"
        @click="startCheckout(preset)"
      >
        <span class="bold">{{ preset }}</span>
        <span class="small-text">credits</span>
        <span class="small-text">${{ creditsToUsd(preset).toFixed(2) }}</span>
      </button>
    </div>

    <h6 style="margin-top: 1.5rem">Or pick a custom amount</h6>
    <div class="custom-row">
      <div class="field border round" style="flex: 1; margin: 0">
        <input
          v-model.number="customAmount"
          type="number"
          :min="effectiveMinCustom"
          :max="MAX_CUSTOM"
          step="1"
          data-testid="buy-credits-custom-input"
          aria-label="Custom credit amount"
        />
      </div>
      <button
        class="small-round"
        :disabled="!customAmountValid || isProcessing"
        data-testid="buy-credits-custom-buy"
        @click="buyCustom"
      >
        <i aria-hidden="true">shopping_cart</i>
        <span
          >Buy {{ customAmount }} credits (${{
            customAmountValid ? creditsToUsd(customAmount).toFixed(2) : "—"
          }})</span
        >
      </button>
    </div>
    <p class="small-text" style="opacity: 0.7; margin-top: 0.25rem">
      Between {{ effectiveMinCustom }} and {{ MAX_CUSTOM }} credits.
    </p>

    <div v-if="isProcessing" class="center-align" style="padding-top: 1.5rem">
      <progress class="circle"></progress>
      <p>Starting checkout...</p>
    </div>
  </main>
</template>

<style scoped>
.preset-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}
.preset-grid button {
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 1rem 0.5rem;
}
.custom-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.error-text {
  color: var(--error, #b00020);
  margin-bottom: 1rem;
}
@media (max-width: 480px) {
  .preset-grid {
    grid-template-columns: 1fr;
  }
}
</style>
