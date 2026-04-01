<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
import { useStorageUrl } from "../composables/useStorageUrl";

const props = defineProps<{
  path?: string | null;
  fallbackUrl?: string | null;
  src?: string | null;
  alt?: string;
}>();

const { url: resolvedUrl } = useStorageUrl(
  toRef(() => props.path),
  toRef(() => props.fallbackUrl),
);

const imgSrc = computed(() => props.src ?? resolvedUrl.value);

const imgLoaded = ref(false);

watch(imgSrc, () => {
  imgLoaded.value = false;
});

function onLoad() {
  imgLoaded.value = true;
}
</script>

<template>
  <span class="storage-image-wrapper">
    <span v-if="!imgLoaded" class="placeholder shimmer" />
    <img
      v-if="imgSrc"
      v-show="imgLoaded"
      :src="imgSrc"
      :alt="alt ?? ''"
      crossorigin="anonymous"
      @load="onLoad"
    />
  </span>
</template>

<style scoped>
.storage-image-wrapper {
  display: block;
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background: #e0e0e0;
}

.storage-image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.placeholder {
  display: block;
  position: absolute;
  inset: 0;
}

.shimmer {
  background: linear-gradient(135deg, #e0e0e0 25%, #f0f0f0 37%, #e0e0e0 63%);
  background-size: 400% 400%;
  animation: shimmer-diagonal 1.5s ease-in-out infinite;
}

@keyframes shimmer-diagonal {
  0% {
    background-position: 100% 100%;
  }
  100% {
    background-position: 0% 0%;
  }
}
</style>
