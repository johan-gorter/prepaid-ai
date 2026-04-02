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
const imgError = ref(false);

watch(imgSrc, () => {
  imgLoaded.value = false;
  imgError.value = false;
});

function onLoad() {
  imgLoaded.value = true;
}

function onError() {
  imgError.value = true;
}
</script>

<template>
  <span class="storage-image-wrapper">
    <span v-if="!imgLoaded && !imgError" class="placeholder shimmer" />
    <svg
      v-if="imgError"
      class="error-icon"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="48" height="48" fill="none" />
      <path
        d="M8 40h32V16H28l-4-4H8v28zm0 2a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2h17l4 4h11a2 2 0 0 1 2 2v24a2 2 0 0 1-2 2H8z"
        fill="#999"
      />
      <path
        d="M22 22l-2 2 2 2m4-4l2 2-2 2"
        fill="none"
        stroke="#999"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <line
        x1="18"
        y1="34"
        x2="30"
        y2="34"
        stroke="#999"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
    <img
      v-if="imgSrc && !imgError"
      v-show="imgLoaded"
      :src="imgSrc"
      :alt="alt ?? ''"
      crossorigin="anonymous"
      @load="onLoad"
      @error="onError"
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

.error-icon {
  display: block;
  width: 48px;
  height: 48px;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
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
