<script setup lang="ts">
import AppBar from "../components/AppBar.vue";
import LegalFooter from "../components/LegalFooter.vue";
import { useAuth } from "../composables/useAuth";

const { currentUser } = useAuth();

// Published contact e-mail for the colofon (art. 3:15d BW). Kept as a constant
// so the same address can be reused in the privacy contact copy.
const contactEmail = "info@payasyougo.app";
</script>

<template>
  <AppBar />

  <main
    class="responsive"
    style="
      max-width: 800px;
      margin: 0 auto;
      padding-top: var(--app-bar-clearance);
    "
  >
    <h4>{{ $t("about.title") }}</h4>
    <p>{{ $t("about.intro") }}</p>

    <h5>{{ $t("about.colofonTitle") }}</h5>
    <ul data-testid="about-colofon">
      <li>{{ $t("about.colofonTradeName") }}</li>
      <li>{{ $t("about.colofonKvk") }}</li>
      <li>{{ $t("about.colofonEmail", { email: contactEmail }) }}</li>
      <li>{{ $t("about.colofonCountry") }}</li>
      <li>{{ $t("about.colofonVat") }}</li>
    </ul>

    <i18n-t keypath="about.moreLinks" tag="p">
      <template #privacy>
        <router-link to="/privacy">{{ $t("footer.privacy") }}</router-link>
      </template>
      <template #terms>
        <router-link to="/terms">{{ $t("footer.terms") }}</router-link>
      </template>
    </i18n-t>

    <div style="padding-top: 1rem">
      <router-link :to="currentUser ? '/' : '/login'" class="button">
        <i>arrow_back</i>
        <span>{{ $t("common.back") }}</span>
      </router-link>
    </div>

    <LegalFooter />
  </main>
</template>
