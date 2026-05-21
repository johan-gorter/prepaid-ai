<script setup lang="ts">
import { httpsCallable } from "firebase/functions";
import { computed, ref } from "vue";
import AppBar from "../components/AppBar.vue";
import { useBalance } from "../composables/useBalance";
import { functions } from "../firebase";

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
      err instanceof Error ? err.message : "Failed to send credits";
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <AppBar title="Send credits" />

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
      <h5>Gift on its way</h5>
      <p style="opacity: 0.7; max-width: 28rem; margin: 0 auto">
        If <strong>{{ email.trim() }}</strong> has an account they'll be asked
        to accept the {{ amount }} credits. The credits are reserved until they
        accept, and return to your balance automatically if they don't accept
        within 24 hours.
      </p>
      <div style="padding-top: 1.5rem">
        <router-link to="/balance" class="button">
          <i>arrow_back</i>
          <span>Back to Balance</span>
        </router-link>
      </div>
    </div>

    <!-- Form -->
    <form v-else style="padding-top: 2rem" @submit.prevent="onSend">
      <p style="opacity: 0.7">
        Send credits from your balance to someone by their email address. You
        currently have <strong>{{ balance }} credits</strong>.
      </p>

      <div class="field label border round" style="margin-top: 1.5rem">
        <input
          v-model="email"
          type="email"
          autocomplete="off"
          data-testid="send-email"
          required
        />
        <label>Recipient email</label>
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
        <label>Amount (credits)</label>
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
          <span>Cancel</span>
        </router-link>
        <button type="submit" :disabled="!canSend" data-testid="send-submit">
          <i aria-hidden="true">send</i>
          <span>{{ sending ? "Sending…" : "Send gift" }}</span>
        </button>
      </nav>
    </form>
  </main>
</template>
