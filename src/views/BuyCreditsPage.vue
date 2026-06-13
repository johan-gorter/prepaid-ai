<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppBar from "../components/AppBar.vue";
import { useCheckout } from "../composables/useCheckout";
import { creditsToUsd } from "../credits";

const { t } = useI18n();
const { isProcessing, errorMessage, minCredits, maxCredits, startCheckout } =
  useCheckout();

const PRESETS = [75, 200, 500] as const;
const MIN_CUSTOM = 75;
const MAX_CUSTOM = 10000;
const DEFAULT_CUSTOM = 1000;

const customAmount = ref(DEFAULT_CUSTOM);

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
    return t("buyCredits.costExact", { credits: lo, usd: loUsd });
  }
  return t("buyCredits.costRange", { lo, hi, loUsd, hiUsd });
});

const customAmountValid = computed(
  () =>
    Number.isInteger(customAmount.value) &&
    customAmount.value >= effectiveMinCustom.value &&
    customAmount.value <= MAX_CUSTOM,
);

function buyCustom() {
  if (!customAmountValid.value) return;
  void startCheckout(customAmount.value);
}
</script>

<template>
  <AppBar />

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
      <h4>{{ $t("buyCredits.title") }}</h4>
    </div>

    <article
      v-if="costMessage"
      class="border"
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

    <h6>{{ $t("buyCredits.chooseAmount") }}</h6>
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
        <span class="small-text">{{ $t("buyCredits.creditsLabel") }}</span>
        <span class="small-text">${{ creditsToUsd(preset).toFixed(2) }}</span>
      </button>
    </div>

    <h6 style="margin-top: 1.5rem">{{ $t("buyCredits.customAmountTitle") }}</h6>
    <div class="custom-row">
      <div class="field border round" style="flex: 1; margin: 0">
        <input
          v-model.number="customAmount"
          type="number"
          :min="effectiveMinCustom"
          :max="MAX_CUSTOM"
          step="1"
          data-testid="buy-credits-custom-input"
          :aria-label="$t('buyCredits.customAmountAria')"
        />
      </div>
      <button
        class="small-round"
        :disabled="!customAmountValid || isProcessing"
        data-testid="buy-credits-custom-buy"
        @click="buyCustom"
      >
        <i aria-hidden="true">shopping_cart</i>
        <span>{{
          $t("buyCredits.buyAmount", {
            credits: customAmount,
            usd: customAmountValid ? creditsToUsd(customAmount).toFixed(2) : "—",
          })
        }}</span>
      </button>
    </div>
    <p class="small-text" style="opacity: 0.7; margin-top: 0.25rem">
      {{ $t("buyCredits.betweenHint", { min: effectiveMinCustom, max: MAX_CUSTOM }) }}
    </p>

    <div v-if="isProcessing" class="center-align" style="padding-top: 1.5rem">
      <progress class="circle"></progress>
      <p>{{ $t("buyCredits.startingCheckout") }}</p>
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
