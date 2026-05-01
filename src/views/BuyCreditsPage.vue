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

const PRESETS = [50, 200, 500] as const;
const MIN_CUSTOM = 10;
const MAX_CUSTOM = 10000;
const DEFAULT_CUSTOM = 1000;

const customAmount = ref(DEFAULT_CUSTOM);
const isProcessing = ref(false);
const errorMessage = ref<string | null>(null);

const isEmulatorMode = import.meta.env.VITE_USE_EMULATORS === "true";

const minCredits = computed(() => Number(route.query.min ?? 0) || 0);
const maxCredits = computed(() => Number(route.query.max ?? 0) || 0);
const redirectTo = computed(
  () => (route.query.redirect as string | undefined) ?? "/main",
);

const minUsd = computed(() => creditsToUsd(minCredits.value));
const maxUsd = computed(() => creditsToUsd(maxCredits.value));

const costMessage = computed(() => {
  if (!minCredits.value && !maxCredits.value) return null;
  if (minCredits.value === maxCredits.value) {
    return `This operation costs ${minCredits.value} credits ($${minUsd.value.toFixed(2)}). You must buy credits in order to proceed.`;
  }
  return `This operation costs between ${minCredits.value} and ${maxCredits.value} credits ($${minUsd.value.toFixed(2)} – $${maxUsd.value.toFixed(2)}). You must buy credits in order to proceed.`;
});

const customAmountValid = computed(
  () =>
    Number.isInteger(customAmount.value) &&
    customAmount.value >= MIN_CUSTOM &&
    customAmount.value <= MAX_CUSTOM,
);

async function tryResumePending() {
  const pending = await getPendingPurchase();
  if (!pending) return;
  customAmount.value = pending.credits;
  // If the user just signed in to complete their purchase, jump straight
  // back into checkout instead of forcing them to click the amount again.
  if (currentUser.value && !isProcessing.value) {
    await startCheckout(pending.credits);
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

async function startCheckout(credits: number) {
  if (isProcessing.value) return;
  errorMessage.value = null;
  isProcessing.value = true;

  try {
    await setPendingPurchase({ credits, redirect: redirectTo.value });

    if (!currentUser.value) {
      // Sign in first; the login page will return us here, and the watcher
      // below will pick up the pending purchase and continue checkout.
      router.push({
        path: "/login",
        query: { redirect: route.fullPath },
      });
      return;
    }

    if (isEmulatorMode) {
      // Dummy implementation: skip the payment provider entirely and
      // credit the balance via a Cloud Function, then return to the
      // page that initiated the purchase.
      const purchase = httpsCallable<
        { amount: number },
        { amount: number; newBalance: number }
      >(functions, "purchaseCredits");
      await purchase({ amount: credits });
      await clearPendingPurchase();
      router.replace(redirectTo.value);
      return;
    }

    // Production: hand off to Stripe Checkout. The session URL is provided
    // by a Cloud Function which is not yet wired up — fail loudly until
    // it's implemented so we never silently lose a purchase intent.
    throw new Error(
      "Stripe checkout is not configured for this environment yet.",
    );
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : "Failed to start checkout";
    isProcessing.value = false;
  }
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
    style="max-width: 600px; margin: 0 auto; padding-top: 4.5rem"
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
        :disabled="isProcessing"
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
          :min="MIN_CUSTOM"
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
      Between {{ MIN_CUSTOM }} and {{ MAX_CUSTOM }} credits.
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
