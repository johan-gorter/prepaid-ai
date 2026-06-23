<template>
  <header class="fixed">
    <nav>
      <!-- Logo only — no breadcrumbs; page titles live in the page content
           (#84). Single full wordmark at all widths: it scales down on narrow
           screens (see style.css) and, when even that no longer fits, the
           heading truncates it with an ellipsis. -->
      <h6 class="app-bar-logo-box" data-testid="app-logo">
        <!-- No aria-label here: the logo text is the accessible name of both
             the link and the surrounding heading ("payasyougo.app"). -->
        <router-link to="/" class="app-bar-logo-link">
          <Logo :size="28" />
        </router-link>
      </h6>

      <slot />
      <LanguageMenu v-if="!isAuthenticated" />
      <UserMenu />
    </nav>
  </header>
</template>

<script setup lang="ts">
import { useAuth } from "../composables/useAuth";
import LanguageMenu from "./LanguageMenu.vue";
import Logo from "./Logo.vue";
import UserMenu from "./UserMenu.vue";

const { isAuthenticated } = useAuth();
</script>

<style scoped>
/* The logo box absorbs all space the app-bar actions leave over. When the
   leftover space cannot fit the full wordmark, overflow:hidden +
   text-overflow:ellipsis on the heading (see style.css) truncates it. For that
   to work the link must stay inline-level — an inline-flex/inline-block link
   would clip without an ellipsis. */
.app-bar-logo-box {
  flex: 1 1 0;
  min-width: 0;
  margin: 0;
  /* Establish a sizing container so the wordmark can scale to the space left
     over by the app-bar actions (see the cqi-based clamp in style.css). This
     is container units only — there is no longer a @container query swapping
     logo variants. */
  container-type: inline-size;
}

.app-bar-logo-link {
  display: inline;
  text-decoration: none;
  color: inherit;
  padding: 0;
}

header {
  border-bottom: 1px solid var(--outline-variant);
}
</style>
