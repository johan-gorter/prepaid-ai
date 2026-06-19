<script setup lang="ts">
import AppBar from "../components/AppBar.vue";
import LegalFooter from "../components/LegalFooter.vue";
import { useAuth } from "../composables/useAuth";

const { currentUser } = useAuth();
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
    <h4>{{ $t("terms.title") }}</h4>
    <i18n-t keypath="terms.intro" tag="p">
      <template #privacy>
        <router-link to="/privacy">{{ $t("footer.privacy") }}</router-link>
      </template>
    </i18n-t>

    <h5>{{ $t("terms.acceptableUseTitle") }}</h5>
    <i18n-t keypath="terms.acceptableUseIntro" tag="p">
      <template #mustNot
        ><strong>{{ $t("terms.mustNot") }}</strong></template
      >
    </i18n-t>
    <ul>
      <li>{{ $t("terms.acceptableUseNoHarmfulContent") }}</li>
      <li>{{ $t("terms.acceptableUseNoPii") }}</li>
      <li>{{ $t("terms.acceptableUseNoPeopleWithoutConsent") }}</li>
      <li>{{ $t("terms.acceptableUseNoLicensePlates") }}</li>
    </ul>
    <p>{{ $t("terms.acceptableUseOutro") }}</p>

    <h5>{{ $t("terms.creditsTitle") }}</h5>
    <p>{{ $t("terms.credits") }}</p>

    <h5>{{ $t("terms.withdrawalTitle") }}</h5>
    <p>{{ $t("terms.withdrawal") }}</p>

    <h5>{{ $t("terms.ageTitle") }}</h5>
    <p>{{ $t("terms.age") }}</p>

    <h5>{{ $t("terms.aiTitle") }}</h5>
    <p>{{ $t("terms.ai") }}</p>

    <h5>{{ $t("terms.liabilityTitle") }}</h5>
    <p>{{ $t("terms.liability") }}</p>

    <h5>{{ $t("terms.lawTitle") }}</h5>
    <p>{{ $t("terms.law") }}</p>

    <h5>{{ $t("terms.changesTitle") }}</h5>
    <p>{{ $t("terms.changes") }}</p>

    <div style="padding-top: 1rem">
      <router-link :to="currentUser ? '/' : '/login'" class="button">
        <i>arrow_back</i>
        <span>{{ $t("common.back") }}</span>
      </router-link>
    </div>

    <LegalFooter />
  </main>
</template>
