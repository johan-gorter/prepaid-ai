<script setup lang="ts">
/**
 * Site footer with the three legal-page links (About · Privacy · Usage Terms)
 * and a one-line business-identity row (#81). Shown on the landing page and the
 * login page — the privacy-policy link near the auth UI is a hard requirement
 * for the Google/Microsoft sign-in providers, not polish.
 *
 * This is an in-flow footer, distinct from the fixed bottom-nav `StickyFooter`
 * used inside the wizard/buy flows.
 */
import { computed } from "vue";

const year = computed(() => new Date().getFullYear());
</script>

<template>
  <footer class="legal-footer center-align" data-testid="legal-footer">
    <nav class="legal-footer-links">
      <router-link to="/about" data-testid="footer-about">{{
        $t("footer.about")
      }}</router-link>
      <span class="legal-footer-sep" aria-hidden="true">·</span>
      <router-link to="/privacy" data-testid="footer-privacy">{{
        $t("footer.privacy")
      }}</router-link>
      <span class="legal-footer-sep" aria-hidden="true">·</span>
      <router-link to="/terms" data-testid="footer-terms">{{
        $t("footer.terms")
      }}</router-link>
    </nav>
    <p class="legal-footer-identity small-text">
      {{ $t("footer.identity", { year }) }}
    </p>
  </footer>
</template>

<style scoped>
.legal-footer {
  margin-top: 2rem;
  padding: 1rem 0 1.5rem;
}

.legal-footer-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.legal-footer-sep {
  opacity: 0.5;
}

.legal-footer-identity {
  margin: 0.5rem 0 0;
  opacity: 0.6;
}
</style>
