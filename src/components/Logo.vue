<template>
  <span class="logo logo--wide" :style="{ fontSize: `${size}px` }"
    >pay<span class="logo__pp">as</span>you<span class="logo__pp">go</span><span
      class="logo__pp"
      >.</span
    >app</span
  >
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number;
  }>(),
  { size: 28 },
);
</script>

<style scoped>
.logo {
  font-family: "Roboto Flex", "Roboto", sans-serif;
  font-weight: 800;
  font-stretch: 75%;
  letter-spacing: -0.02em;
  color: currentColor;
  user-select: none;
  /* inline (not inline-block) so an ancestor's text-overflow: ellipsis can
     truncate the wordmark when the AppBar is too narrow to fit it. */
  display: inline;
}

.logo__pp {
  color: var(--primary);
}

.logo--wide {
  line-height: 1;
  white-space: nowrap;
}
</style>
