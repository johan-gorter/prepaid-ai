<template>
  <header class="fixed">
    <nav>
      <!-- Logo only — no breadcrumbs; page titles live in the page content
           (#84). Full wordmark by default, square variant only when the
           space next to the app-bar actions is too narrow for it. -->
      <h6 class="app-bar-logo-box" data-testid="app-logo">
        <!-- No aria-label here: the logo text is the accessible name of both
             the link and the surrounding heading ("payasyougo.app"). -->
        <router-link to="/" class="app-bar-logo-link">
          <span class="app-bar-logo--wide"><Logo variant="wide" :size="28" /></span>
          <span class="app-bar-logo--square"><Logo variant="square" :size="28" /></span>
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
/* The logo box absorbs all space the app-bar actions leave over, and acts as
   the container the logo variants respond to: when the leftover space cannot
   fit the full wordmark, the square logo is shown instead. */
.app-bar-logo-box {
  flex: 1 1 0;
  min-width: 0;
  margin: 0;
  container-type: inline-size;
}

.app-bar-logo-link {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  color: inherit;
  padding: 0;
}

.app-bar-logo--wide,
.app-bar-logo--square {
  display: inline-flex;
  align-items: center;
}

.app-bar-logo--square {
  display: none;
}

@container (max-width: 190px) {
  .app-bar-logo--wide {
    display: none;
  }

  .app-bar-logo--square {
    display: inline-flex;
  }
}

header {
  border-bottom: 1px solid var(--outline-variant);
}
</style>
