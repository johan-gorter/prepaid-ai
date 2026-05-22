<script setup lang="ts">
import { httpsCallable } from "firebase/functions";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppBar from "../components/AppBar.vue";
import { useBalance } from "../composables/useBalance";
import { functions } from "../firebase";

const { t } = useI18n();
const { balance } = useBalance();

const email = ref("");
const amount = ref<number | null>(null);
const sending = ref(false);
const errorMessage = ref<string | null>(null);
const sent = ref(false);

const sendCreditTransfer = httpsCallable<
  { recipientEmail: string; amount: number },
  { ok: true; amount: number; newBalance: number }
>(functions, "sendCreditTransfer");

const canSend = computed(
  () =>
    !sending.value &&
    /.+@.+\..+/.test(email.value.trim()) &&
    !!amount.value &&
    Number.isInteger(amount.value) &&
    amount.value > 0 &&
    amount.value <= balance.value,
);

async function onSend() {
  if (!canSend.value || amount.value == null) return;
  errorMessage.value = null;
  sending.value = true;
  try {
    await sendCreditTransfer({
      recipientEmail: email.value.trim(),
      amount: amount.value,
    });
    sent.value = true;
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : t("sendCredits.errorGeneric");
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <AppBar :title="$t('sendCredits.title')" />

  <main
    class="responsive"
    style="
      max-width: 800px;
      margin: 0 auto;
      padding-top: var(--app-bar-clearance);
    "
  >
    <!-- Confirmation -->
    <div v-if="sent" class="center-align" style="padding-top: 3rem">
      <i class="extra" style="font-size: 3rem; color: var(--primary)"
        >redeem</i
      >
      <h5>{{ $t("sendCredits.giftOnWay") }}</h5>
      <i18n-t
        keypath="sendCredits.giftOnWayDetail"
        tag="p"
        style="opacity: 0.7; max-width: 28rem; margin: 0 auto"
      >
        <template #email><strong>{{ email.trim() }}</strong></template>
        <template #amount>{{ amount }}</template>
      </i18n-t>
      <div style="padding-top: 1.5rem">
        <router-link to="/balance" class="button">
          <i>arrow_back</i>
          <span>{{ $t("common.backToBalance") }}</span>
        </router-link>
      </div>
    </div>

    <!-- Form -->
    <form v-else style="padding-top: 2rem" @submit.prevent="onSend">
      <i18n-t keypath="sendCredits.formIntro" tag="p" style="opacity: 0.7">
        <template #balance>
          <strong>{{ $t("sendCredits.balanceCredits", { count: balance }) }}</strong>
        </template>
      </i18n-t>

      <div class="field label border round" style="margin-top: 1.5rem">
        <input
          v-model="email"
          type="email"
          autocomplete="off"
          data-testid="send-email"
          required
        />
        <label>{{ $t("sendCredits.recipientEmail") }}</label>
      </div>

      <div class="field label border round">
        <input
          v-model.number="amount"
          type="number"
          min="1"
          step="1"
          :max="balance"
          data-testid="send-amount"
          required
        />
        <label>{{ $t("sendCredits.amountLabel") }}</label>
      </div>

      <p
        v-if="errorMessage"
        class="error-text"
        data-testid="send-error"
        style="color: var(--error)"
      >
        {{ errorMessage }}
      </p>

      <nav style="margin-top: 1rem">
        <router-link to="/balance" class="button border">
          <span>{{ $t("common.cancel") }}</span>
        </router-link>
        <button type="submit" :disabled="!canSend" data-testid="send-submit">
          <i aria-hidden="true">send</i>
          <span>{{ sending ? $t("sendCredits.sending") : $t("sendCredits.sendGift") }}</span>
        </button>
      </nav>
    </form>
  </main>
</template>
