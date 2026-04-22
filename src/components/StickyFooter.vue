<template>
  <footer class="fixed">
    <nav class="footer-nav">
      <slot />
    </nav>
  </footer>
</template>

<style scoped>
.footer-nav {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}
</style>
