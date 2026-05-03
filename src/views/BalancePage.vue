<script setup lang="ts">
import { httpsCallable } from "firebase/functions";
import { onMounted, ref } from "vue";
import AppBar from "../components/AppBar.vue";
import { useBalance } from "../composables/useBalance";
import { useCheckout } from "../composables/useCheckout";
import { functions } from "../firebase";
import { CREDIT_PACKAGES, TRANSACTION_REASONS } from "../types";
import type { CreditPackageId } from "../types";

const { balance, transactions, loading } = useBalance();
const { purchasing, error: checkoutError, dummyResult, purchase } = useCheckout();

// Driven by the server so it reflects the actual STRIPE_BACKEND, not the
// build-time emulator flag (a deployed sandbox can run with backend=dummy).
const isDummyBackend = ref(false);
onMounted(async () => {
  try {
    const getConfig = httpsCallable<unknown, { backend: string }>(
      functions,
      "getStripeConfig",
    );
    const { data } = await getConfig({});
    isDummyBackend.value = data.backend === "dummy";
  } catch {
    // Banner just won't show — safe default.
  }
});

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
</script>

<template>
  <AppBar title="Balance" />

  <main
    class="responsive"
    style="max-width: 800px; margin: 0 auto; padding-top: 4.5rem"
  >
    <div v-if="loading" class="center-align" style="padding-top: 4rem">
      <progress class="circle"></progress>
    </div>

    <template v-else>
      <div class="center-align" style="padding: 2rem 0">
        <i class="extra" style="font-size: 3rem; opacity: 0.5"
          >account_balance_wallet</i
        >
        <h4 data-testid="balance-amount">{{ balance }} credits</h4>
        <p class="small" style="opacity: 0.6">Current balance</p>
      </div>

      <!-- Buy credits -->
      <h6>Buy credits</h6>
      <div v-if="isDummyBackend" class="row surface-variant" style="padding: 0.5rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; gap: 0.5rem; align-items: center" data-testid="dummy-backend-banner">
        <i>science</i>
        <span class="small">Test mode — purchases add credits directly without charging.</span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.75rem; margin-bottom: 1rem">
        <button
          v-for="pkg in CREDIT_PACKAGES"
          :key="pkg.id"
          class="border"
          style="flex-direction: column; gap: 0.25rem; padding: 1rem"
          :disabled="purchasing"
          @click="purchase(pkg.id as CreditPackageId)"
        >
          <span style="font-size: 1.1rem; font-weight: 600">{{ pkg.credits }} credits</span>
          <span class="small" style="opacity: 0.7">{{ formatPrice(pkg.priceCents) }}</span>
        </button>
      </div>

      <div v-if="dummyResult" class="row" style="color: var(--primary); gap: 0.5rem; margin-bottom: 0.5rem; align-items: center">
        <i>check_circle</i>
        <span data-testid="dummy-purchase-result">{{ dummyResult.credits }} credits added (dummy purchase)</span>
      </div>

      <div v-if="checkoutError" class="row" style="color: var(--error); gap: 0.5rem; margin-bottom: 0.5rem; align-items: center">
        <i>error</i>
        <span>{{ checkoutError }}</span>
      </div>

      <h6>Recent transactions</h6>
      <div
        v-if="transactions.length === 0"
        class="center-align"
        style="padding: 2rem 0; opacity: 0.5"
      >
        <p>No transactions yet.</p>
      </div>
      <table v-else class="border">
        <thead>
          <tr>
            <th>Reason</th>
            <th class="right-align">Amount</th>
            <th class="right-align">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="txn in transactions" :key="txn.id">
            <td>{{ TRANSACTION_REASONS[txn.reasonKey] || txn.reasonKey }}</td>
            <td
              class="right-align"
              :style="{
                color:
                  txn.amount < 0
                    ? 'var(--error, #b00020)'
                    : 'var(--primary, #006b3e)',
              }"
            >
              {{ txn.amount > 0 ? "+" : "" }}{{ txn.amount }}
            </td>
            <td class="right-align">{{ txn.balanceAfter }}</td>
          </tr>
        </tbody>
      </table>

      <div class="center-align" style="padding: 1.5rem 0">
        <router-link to="/main" class="button">
          <i>arrow_back</i>
          <span>Back to Main</span>
        </router-link>
      </div>
    </template>
  </main>
</template>
