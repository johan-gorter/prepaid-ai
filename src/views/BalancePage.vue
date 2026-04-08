<script setup lang="ts">
import UserMenu from "../components/UserMenu.vue";
</script>

<template>
  <header class="fixed primary">
    <nav>
      <router-link to="/main" class="breadcrumb-root">Prepaid AI</router-link>
      <span class="breadcrumb-sep">&gt;</span>
      <h5 class="max">Balance</h5>
      <UserMenu />
    </nav>
  </header>

  <main
    class="responsive"
    style="max-width: 700px; margin: 0 auto; padding-top: 4.5rem"
  >
    <div class="center-align" style="padding-top: 4rem">
      <i class="extra" style="font-size: 4rem; opacity: 0.4">construction</i>
      <h5>Work in progress</h5>
      <p>The balance feature is coming soon. Stay tuned!</p>
      <router-link to="/main" class="button">
        <i>arrow_back</i>
        <span>Back to Main</span>
      </router-link>
    </div>
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

@media (max-width: 360px) {
  .breadcrumb-root {
    max-width: 5rem;
  }
}
</style>
