<script setup lang="ts">
import UserMenu from "../components/UserMenu.vue";
import { useBalance } from "../composables/useBalance";
import { TRANSACTION_REASONS } from "../types";

const { balance, transactions, loading } = useBalance();
</script>

<template>
  <header class="fixed primary">
    <nav>
      <router-link to="/main" class="breadcrumb-root">Prepaid AI</router-link>
      <span class="breadcrumb-sep">&gt;</span>
      <h5 class="max">Balance</h5>
      <UserMenu />
    </nav>
  </header>

  <main
    class="responsive"
    style="max-width: 700px; margin: 0 auto; padding-top: 4.5rem"
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

<style scoped>
.breadcrumb-root {
  text-decoration: underline;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 1.25rem;
  font-weight: 500;
  color: inherit;
  min-width: 0;
}

.breadcrumb-sep {
  margin: 0 0.25rem;
  flex-shrink: 0;
}

@media (max-width: 360px) {
  .breadcrumb-root {
    max-width: 5rem;
  }
}
</style>
