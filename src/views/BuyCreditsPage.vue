<script setup lang="ts">
import { computed, ref } from "vue";
import AppBar from "../components/AppBar.vue";
import StickyFooter from "../components/StickyFooter.vue";
import { useAuth } from "../composables/useAuth";
import { useCheckout } from "../composables/useCheckout";
import { creditsToUsd } from "../credits";

const { currentUser } = useAuth();
const { isProcessing, errorMessage, minCredits, maxCredits, startCheckout } =
  useCheckout();

const PRESETS = [75, 200, 500] as const;
const MIN_CUSTOM = 75;
const MAX_CUSTOM = 10000;
const DEFAULT_CUSTOM = 1000;

type Choice = "75" | "200" | "500" | "custom";

/**
 * Lower bound for any chosen amount. The page is invoked by a flow that
 * already knows the user needs at least `minCredits` to unblock the pending
 * action, so let the larger of the two limits win — but never dip below
 * MIN_CUSTOM (the Stripe-cost floor).
 */
const effectiveMin = computed(() => Math.max(MIN_CUSTOM, minCredits.value));

const customAmount = ref(Math.max(DEFAULT_CUSTOM, effectiveMin.value));

// Default to the smallest preset that still covers the action; fall back to
// the custom field (pre-filled to the minimum) when even 500 is too small.
function initialChoice(): Choice {
  const firstValid = PRESETS.find((p) => p >= effectiveMin.value);
  return firstValid ? (String(firstValid) as Choice) : "custom";
}
const choice = ref<Choice>(initialChoice());

function presetEnabled(preset: number): boolean {
  return preset >= effectiveMin.value;
}

const customAmountValid = computed(
  () =>
    Number.isInteger(customAmount.value) &&
    customAmount.value >= effectiveMin.value &&
    customAmount.value <= MAX_CUSTOM,
);

/** Credits represented by the current selection. */
const selectedCredits = computed(() =>
  choice.value === "custom" ? customAmount.value : Number(choice.value),
);

const selectionValid = computed(() =>
  choice.value === "custom"
    ? customAmountValid.value
    : presetEnabled(selectedCredits.value),
);

const selectedUsd = computed(() =>
  selectionValid.value ? creditsToUsd(selectedCredits.value).toFixed(2) : "—",
);

// Action context line, driven by the min/max query params and kept
// action-agnostic (the page also serves chat, hence the range form).
const contextMessage = computed(() => {
  const lo = Math.min(minCredits.value, maxCredits.value);
  const hi = Math.max(minCredits.value, maxCredits.value);
  if (!lo && !hi) return null;
  const loUsd = creditsToUsd(lo).toFixed(2);
  const hiUsd = creditsToUsd(hi).toFixed(2);
  if (lo === hi) {
    return {
      key: "buyCredits.contextExact",
      params: { credits: lo, usd: loUsd },
    };
  }
  return {
    key: "buyCredits.contextRange",
    params: { lo, hi, loUsd, hiUsd },
  };
});

const waiverAccepted = ref(false);

const canSubmit = computed(
  () => waiverAccepted.value && selectionValid.value && !isProcessing.value,
);

function selectCustom() {
  choice.value = "custom";
}

function submit() {
  if (!canSubmit.value) return;
  void startCheckout(selectedCredits.value, {
    waiverAccepted: waiverAccepted.value,
  });
}
</script>

<template>
  <AppBar />

  <main
    class="responsive buy-credits-main"
    style="max-width: 600px; margin: 0 auto"
  >
    <h4 class="center-align" style="padding: 1rem 0 0.5rem">
      {{ $t("buyCredits.title") }}
    </h4>

    <!-- Context: what this action costs + the work-is-saved reassurance. -->
    <article
      v-if="contextMessage"
      class="border context-block"
      data-testid="buy-credits-cost-message"
    >
      <p class="no-margin">
        {{ $t(contextMessage.key, contextMessage.params) }}
      </p>
      <p class="small-text no-margin" style="opacity: 0.8; margin-top: 0.35rem">
        {{ $t("buyCredits.contextReassurance") }}
      </p>
    </article>

    <p v-if="errorMessage" class="error-text" data-testid="buy-credits-error">
      {{ errorMessage }}
    </p>

    <!-- One choice list (radio behaviour, exactly one selected). -->
    <div role="radiogroup" class="choice-list">
      <label
        v-for="preset in PRESETS"
        :key="preset"
        class="row choice-row"
        :class="{ active: choice === String(preset) }"
      >
        <input
          type="radio"
          name="amount"
          class="choice-radio"
          :value="String(preset)"
          v-model="choice"
          :disabled="isProcessing || !presetEnabled(preset)"
          :data-testid="`buy-credits-preset-${preset}`"
        />
        <div class="max">
          <div>
            {{
              $t("buyCredits.optionLabel", {
                credits: preset,
                usd: creditsToUsd(preset).toFixed(2),
              })
            }}
          </div>
          <div v-if="preset === 75" class="small-text" style="opacity: 0.7">
            {{ $t("buyCredits.presetHint75") }}
          </div>
        </div>
      </label>

      <label class="row choice-row" :class="{ active: choice === 'custom' }">
        <input
          type="radio"
          name="amount"
          class="choice-radio"
          value="custom"
          v-model="choice"
          :disabled="isProcessing"
          data-testid="buy-credits-custom-option"
        />
        <div class="max">
          <div>{{ $t("buyCredits.customOption") }}</div>
          <div class="field border round no-margin" style="margin-top: 0.35rem">
            <input
              v-model.number="customAmount"
              type="number"
              :min="effectiveMin"
              :max="MAX_CUSTOM"
              step="1"
              data-testid="buy-credits-custom-input"
              :aria-label="$t('buyCredits.customAmountAria')"
              @focus="selectCustom"
            />
          </div>
          <div class="small-text" style="opacity: 0.7; margin-top: 0.25rem">
            {{
              $t("buyCredits.betweenHint", {
                min: effectiveMin,
                max: MAX_CUSTOM,
              })
            }}
          </div>
        </div>
      </label>
    </div>

    <!-- Trust lines. -->
    <p class="small-text trust-line">{{ $t("buyCredits.trustLine1") }}</p>
    <p class="small-text trust-line">{{ $t("buyCredits.trustLine2") }}</p>

    <!-- Withdrawal-waiver: express consent directly above the CTA (#81). -->
    <div class="waiver-row">
      <input
        id="buy-credits-waiver"
        type="checkbox"
        class="waiver-checkbox"
        v-model="waiverAccepted"
        data-testid="buy-credits-waiver"
      />
      <label for="buy-credits-waiver">{{ $t("buyCredits.waiverLabel") }}</label>
    </div>

    <div v-if="isProcessing" class="center-align" style="padding-top: 1rem">
      <progress class="circle"></progress>
      <p>{{ $t("buyCredits.startingCheckout") }}</p>
    </div>
  </main>

  <!-- Sticky footer: one primary CTA showing the live amount. -->
  <StickyFooter>
    <div class="cta-stack">
      <p
        v-if="!currentUser"
        class="small-text cta-login-hint"
        data-testid="buy-credits-login-hint"
      >
        {{ $t("buyCredits.ctaLoginHint") }}
      </p>
      <button
        class="max small-round"
        :disabled="!canSubmit"
        data-testid="buy-credits-submit"
        @click="submit"
      >
        <i aria-hidden="true">lock</i>
        <span>{{ $t("buyCredits.ctaPay", { usd: selectedUsd }) }}</span>
      </button>
    </div>
  </StickyFooter>
</template>

<style scoped>
.buy-credits-main {
  padding-top: var(--app-bar-clearance);
  /* Clear the sticky footer so the waiver checkbox is never hidden behind it. */
  padding-bottom: 8rem;
}

.context-block {
  margin-bottom: 1.5rem;
  border-left: 4px solid var(--primary, #006b3e);
}

.choice-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.choice-row {
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--outline-variant, #c4c7c0);
  border-radius: 0.75rem;
  cursor: pointer;
}

.choice-row.active {
  border-color: var(--primary, #006b3e);
  background: var(--primary-container, #9af6c0);
}

.choice-row .field input {
  /* The numeric input lives inside a flex row; keep it from stretching wide. */
  max-width: 12rem;
}

.choice-radio {
  margin-top: 0.2rem;
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--primary, #006b3e);
  flex: 0 0 auto;
}

.trust-line {
  opacity: 0.7;
  margin: 0.5rem 0 0;
}

.waiver-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-top: 1.25rem;
}

.waiver-checkbox {
  margin-top: 0.15rem;
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--primary, #006b3e);
  flex: 0 0 auto;
}

.waiver-row label {
  cursor: pointer;
}

.error-text {
  color: var(--error, #b00020);
  margin-bottom: 1rem;
}

.cta-stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.25rem;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.cta-login-hint {
  text-align: center;
  opacity: 0.7;
  margin: 0;
}
</style>
