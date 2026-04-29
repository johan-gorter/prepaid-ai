<template>
  <span :class="['logo', `logo--${variant}`]" :style="{ fontSize: `${size}px` }">
    <template v-if="variant === 'wide'">
      pay<span class="logo__pp">as</span>you<span class="logo__pp">go</span><span
        class="logo__pp"
        >.</span
      >app
    </template>
    <template v-else
      ><span>pay</span><span class="logo__pp">as</span><span>you</span><span
        class="logo__pp"
        >go</span
      ></template
    >
  </span>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "wide" | "square";
    size?: number;
  }>(),
  { variant: "wide", size: 28 },
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
  display: inline-block;
}

.logo__pp {
  color: var(--primary);
}

.logo--wide {
  line-height: 1;
  white-space: nowrap;
}

.logo--square {
  display: inline-grid;
  grid-template-columns: auto auto;
  grid-template-rows: auto auto;
  align-items: end;
  justify-items: start;
  line-height: 0.85;
}

.logo--square > span {
  display: inline-block;
}
</style>
