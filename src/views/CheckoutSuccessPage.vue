<script setup lang="ts">
import { useRoute } from "vue-router";
import UserMenu from "../components/UserMenu.vue";

const route = useRoute();
const sessionId = route.query.session_id as string | undefined;
</script>

<template>
  <header class="fixed">
    <nav>
      <router-link to="/" class="breadcrumb-root">payasyougo</router-link>
      <span class="breadcrumb-sep">&gt;</span>
      <router-link to="/balance" class="breadcrumb-root">{{
        $t("checkoutSuccess.breadcrumbBalance")
      }}</router-link>
      <span class="breadcrumb-sep">&gt;</span>
      <h1 class="max">{{ $t("checkoutSuccess.breadcrumbTitle") }}</h1>
      <UserMenu />
    </nav>
  </header>

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
</style>
