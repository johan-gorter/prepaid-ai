<script setup lang="ts">
import { onMounted } from "vue";
import { useRoute } from "vue-router";
import AppBar from "../components/AppBar.vue";
import { track } from "../composables/useTrack";

const route = useRoute();
const sessionId = route.query.session_id as string | undefined;

onMounted(() => {
  track("payment_done");
});
</script>

<template>
  <AppBar />

  <main
    class="responsive center-align"
    style="max-width: 600px; margin: 0 auto; padding-top: 6rem"
  >
    <i style="font-size: 4rem; color: var(--primary)">check_circle</i>
    <h4 data-testid="checkout-success-heading" style="margin-top: 1rem">
      {{ $t("checkoutSuccess.paymentSuccess") }}
    </h4>
    <p style="opacity: 0.7; margin-bottom: 2rem">
      {{ $t("checkoutSuccess.creditsAppear") }}
    </p>

    <router-link to="/balance" class="button">
      <i>account_balance_wallet</i>
      <span>{{ $t("checkoutSuccess.viewBalance") }}</span>
    </router-link>

    <p v-if="sessionId" class="small" style="opacity: 0.4; margin-top: 2rem; word-break: break-all">
      {{ $t("checkoutSuccess.session", { id: sessionId }) }}
    </p>
  </main>
</template>
