<template>
  <span :class="['logo', `logo--${resolvedVariant}`]" :style="sizeStyle">
    <template v-if="resolvedVariant === 'wide'">
      pay<span class="logo__pp">as</span>you<span class="logo__pp">go</span>
    </template>
    <template v-else>
      <span>pay</span><span class="logo__pp">as</span>
      <span>you</span><span class="logo__pp">go</span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{
  variant?: "wide" | "square" | "auto";
  size?: number;
}>();

const isMobile = ref(false);
let mq: MediaQueryList | null = null;
const update = () => {
  isMobile.value = mq?.matches ?? false;
};

onMounted(() => {
  mq = window.matchMedia("(max-width: 480px)");
  update();
  mq.addEventListener("change", update);
});

onBeforeUnmount(() => {
  mq?.removeEventListener("change", update);
});

const resolvedVariant = computed(() => {
  const v = props.variant ?? "auto";
  return v === "auto" ? (isMobile.value ? "square" : "wide") : v;
});

const sizeStyle = computed(() => ({ fontSize: `${props.size ?? 32}px` }));
</script>

<style scoped>
.logo {
  font-family: var(--logo-font-family, "Roboto Flex", "Roboto", sans-serif);
  font-weight: var(--logo-font-weight, 800);
  font-stretch: var(--logo-font-stretch, 75%);
  letter-spacing: var(--logo-tracking, -0.02em);
  color: var(--logo-black, #000);
  user-select: none;
  display: inline-block;
}

.logo__pp {
  color: var(--logo-purple, #7b1fa2);
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
  line-height: var(--logo-stack-leading, 0.85);
}

.logo--square > span {
  display: inline-block;
}
</style>
