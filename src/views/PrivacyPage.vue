<script setup lang="ts">
import AppBar from "../components/AppBar.vue";
import LegalFooter from "../components/LegalFooter.vue";
import { useAuth } from "../composables/useAuth";

const { currentUser } = useAuth();

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
    <h4>{{ $t("privacy.title") }}</h4>
    <p>{{ $t("privacy.intro") }}</p>

    <h5>{{ $t("privacy.dataTitle") }}</h5>
    <ul>
      <li>{{ $t("privacy.dataAccount") }}</li>
      <li>{{ $t("privacy.dataPhotos") }}</li>
      <li>{{ $t("privacy.dataChat") }}</li>
      <li>{{ $t("privacy.dataPayment") }}</li>
    </ul>

    <h5>{{ $t("privacy.processorsTitle") }}</h5>
    <p>{{ $t("privacy.processorsIntro") }}</p>
    <ul>
      <li>{{ $t("privacy.processorsFirebase") }}</li>
      <li>{{ $t("privacy.processorsVertex") }}</li>
      <li>{{ $t("privacy.processorsStripe") }}</li>
    </ul>

    <h5>{{ $t("privacy.purposesTitle") }}</h5>
    <p>{{ $t("privacy.purposes") }}</p>

    <h5>{{ $t("privacy.aiTitle") }}</h5>
    <p>{{ $t("privacy.ai") }}</p>

    <h5>{{ $t("privacy.retentionTitle") }}</h5>
    <i18n-t keypath="privacy.retention" tag="p">
      <template #account>
        <router-link to="/account">{{ $t("common.account") }}</router-link>
      </template>
    </i18n-t>

    <h5>{{ $t("privacy.storageTitle") }}</h5>
    <p>{{ $t("privacy.storage") }}</p>

    <h5>{{ $t("privacy.rightsTitle") }}</h5>
    <p>{{ $t("privacy.rights", { email: contactEmail }) }}</p>

    <h5>{{ $t("privacy.contactTitle") }}</h5>
    <p>{{ $t("privacy.contact", { email: contactEmail }) }}</p>

    <div style="padding-top: 1rem">
      <router-link :to="currentUser ? '/' : '/login'" class="button">
        <i>arrow_back</i>
        <span>{{ $t("common.back") }}</span>
      </router-link>
    </div>

    <LegalFooter />
  </main>
</template>
