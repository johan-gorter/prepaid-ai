<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppBar from "../components/AppBar.vue";
import { useBalance } from "../composables/useBalance";
import type { TransactionReasonKey } from "../types";

const { t } = useI18n();
const { balance, transactions, loading } = useBalance();

function reasonLabel(key: TransactionReasonKey) {
  return t(`balance.reason.${key}`);
}
</script>

<template>
  <AppBar :title="$t('balance.title')" />

  <main
    class="responsive"
    style="
      max-width: 800px;
      margin: 0 auto;
      padding-top: var(--app-bar-clearance);
    "
  >
    <div v-if="loading" class="center-align" style="padding-top: 4rem">
      <progress class="circle"></progress>
    </div>

    <template v-else>
      <div class="center-align" style="padding: 2rem 0">
        <i class="extra" style="font-size: 3rem; opacity: 0.5"
          >account_balance_wallet</i
        >
        <h4 data-testid="balance-amount">
          {{ $t("balance.creditsAmount", { count: balance }) }}
        </h4>
        <p class="small" style="opacity: 0.6">{{ $t("balance.currentBalance") }}</p>
      </div>

      <!-- Buy / send credits -->
      <div
        style="
          margin-bottom: 1.5rem;
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        "
      >
        <router-link to="/buy-credits" class="button">
          <i>add_card</i>
          <span>{{ $t("balance.buyCredits") }}</span>
        </router-link>
        <router-link to="/send-credits" class="button border">
          <i>redeem</i>
          <span>{{ $t("balance.sendCredits") }}</span>
        </router-link>
      </div>

      <h6>{{ $t("balance.recentTransactions") }}</h6>
      <div
        v-if="transactions.length === 0"
        class="center-align"
        style="padding: 2rem 0; opacity: 0.5"
      >
        <p>{{ $t("balance.noTransactions") }}</p>
      </div>
      <table v-else class="border">
        <thead>
          <tr>
            <th>{{ $t("balance.reasonCol") }}</th>
            <th class="right-align">{{ $t("balance.amountCol") }}</th>
            <th class="right-align">{{ $t("balance.balanceCol") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="txn in transactions" :key="txn.id">
            <td>{{ reasonLabel(txn.reasonKey) }}</td>
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
        <router-link to="/" class="button">
          <i>arrow_back</i>
          <span>{{ $t("common.backToMain") }}</span>
        </router-link>
      </div>
    </template>
  </main>
</template>
