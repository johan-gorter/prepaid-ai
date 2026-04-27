<template>
  <header class="fixed">
    <nav>
      <!-- Homescreen: full wordmark only (payasyougo.app) -->
      <template v-if="!title">
        <h6 class="app-bar-home-title" data-testid="app-logo">
          <router-link :to="homeRoute" class="app-bar-logo-link">
            <Logo variant="wide-app" :size="28" />
          </router-link>
        </h6>
        <div class="max"></div>
      </template>

      <!-- Subpage: logo + chevron + title (logo replaces back button on mobile) -->
      <template v-else>
        <router-link
          :to="homeRoute"
          class="app-bar-logo-link"
          aria-label="payasyougo home"
          data-testid="app-logo"
        >
          <Logo variant="auto" :size="28" />
        </router-link>
        <span class="app-bar-sep" aria-hidden="true">&gt;</span>
        <h1 class="max app-bar-title">{{ title }}</h1>
      </template>

      <slot />
      <UserMenu />
    </nav>
  </header>
</template>

<script setup lang="ts">
import Logo from "./Logo.vue";
import UserMenu from "./UserMenu.vue";

withDefaults(
  defineProps<{
    title?: string;
    homeRoute?: string;
  }>(),
  { homeRoute: "/main" },
);
</script>

<style scoped>
.app-bar-logo-link {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  color: inherit;
  flex-shrink: 0;
  padding: 0;
}

.app-bar-home-title {
  display: flex;
  align-items: center;
  margin: 0;
  flex-shrink: 0;
  min-width: 0;
}

.app-bar-sep {
  margin: 0 0.4rem;
  flex-shrink: 0;
  font-size: 1.1rem;
  opacity: 0.6;
}

.app-bar-title {
  min-width: 0;
}
</style>
