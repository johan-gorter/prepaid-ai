<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import MaskingCanvas from "../components/MaskingCanvas.vue";

const router = useRouter();
const maskingRef = ref<InstanceType<typeof MaskingCanvas> | null>(null);

const imageUrl = "/assets/masking-sample.webp";

function handleClear() {
  maskingRef.value?.clearMask();
}
</script>

<template>
  <div class="page-layout">
    <header class="fixed primary">
      <nav>
        <button
          class="transparent circle"
          @click="router.back()"
          aria-label="Back"
        >
          <i aria-hidden="true">arrow_back</i>
        </button>
        <h1 class="max">Masking Test</h1>
      </nav>
    </header>

    <main
      class="responsive"
      style="
        max-width: 600px;
        margin: 0 auto;
        padding-top: 4.5rem;
        padding-bottom: 5rem;
      "
    >
      <p class="small-text center-align">
        Prototype of the new masking component. Press/drag on the image to
        paint.
      </p>

      <MaskingCanvas ref="maskingRef" :image-url="imageUrl" />

      <div class="center-align" style="margin-top: 1rem">
        <button class="transparent small-round" @click="handleClear">
          <i aria-hidden="true">delete_sweep</i>
          <span>Clear Mask</span>
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}
</style>
