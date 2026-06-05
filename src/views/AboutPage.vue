<script setup lang="ts">
import AppBar from "../components/AppBar.vue";
import { useAuth } from "../composables/useAuth";

const { currentUser } = useAuth();
</script>

<template>
  <AppBar :title="$t('about.breadcrumb')" />

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

    <h5>{{ $t("about.acceptableUseTitle") }}</h5>
    <i18n-t keypath="about.acceptableUseIntro" tag="p">
      <template #mustNot><strong>{{ $t("about.mustNot") }}</strong></template>
    </i18n-t>
    <ul>
      <li>{{ $t("about.acceptableUseNoHarmfulContent") }}</li>
      <li>{{ $t("about.acceptableUseNoPii") }}</li>
      <li>{{ $t("about.acceptableUseNoPeopleWithoutConsent") }}</li>
      <li>{{ $t("about.acceptableUseNoLicensePlates") }}</li>
    </ul>
    <p>{{ $t("about.acceptableUseOutro") }}</p>

    <h5>{{ $t("about.dataRetentionTitle") }}</h5>
    <i18n-t keypath="about.dataRetention" tag="p">
      <template #min><strong>{{ $t("about.dataRetentionMin") }}</strong></template>
      <template #max><strong>{{ $t("about.dataRetentionMax") }}</strong></template>
      <template #account>
        <router-link to="/account">{{ $t("common.account") }}</router-link>
      </template>
    </i18n-t>

    <h5>{{ $t("about.privacyTitle") }}</h5>
    <p>{{ $t("about.privacy") }}</p>

    <h5>{{ $t("about.termsTitle") }}</h5>
    <p>{{ $t("about.terms") }}</p>

    <div style="padding-top: 1rem">
      <router-link :to="currentUser ? '/' : '/login'" class="button">
        <i>arrow_back</i>
        <span>{{ $t("common.back") }}</span>
      </router-link>
    </div>
  </main>
</template>
