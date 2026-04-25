<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import MaskingCanvas from "../../../components/MaskingCanvas.vue";
import UserMenu from "../../../components/UserMenu.vue";

const router = useRouter();
const maskingRef = ref<InstanceType<typeof MaskingCanvas> | null>(null);

const imageUrl = "/assets/masking-sample.webp";

const previewUrl = ref<string | null>(null);

function handleClear() {
  maskingRef.value?.clearMask();
}

async function handlePreview() {
  if (!maskingRef.value) return;
  const blob = await maskingRef.value.getCompositeBlob();
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = URL.createObjectURL(blob);
}

function closePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }
}

onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});
</script>

<template>
  <header class="fixed">
    <nav>
      <button
        class="transparent circle"
        @click="router.back()"
        aria-label="Back"
      >
        <i aria-hidden="true">arrow_back</i>
      </button>
      <h1 class="max">Masking Test</h1>
      <UserMenu />
    </nav>
  </header>

  <main
    class="responsive"
    style="
      max-width: 800px;
      margin: 0 auto;
      padding-top: 4.5rem;
      padding-bottom: 5rem;
    "
  >
    <p class="small-text center-align">
      Prototype of the new masking component. Press/drag on the image to paint.
    </p>

    <MaskingCanvas ref="maskingRef" :image-url="imageUrl" />

    <div
      class="center-align"
      style="
        margin-top: 1rem;
        display: flex;
        gap: 0.5rem;
        justify-content: center;
      "
    >
      <button class="transparent small-round" @click="handleClear">
        <i aria-hidden="true">delete_sweep</i>
        <span>Clear Mask</span>
      </button>
      <button class="small-round" @click="handlePreview">
        <i aria-hidden="true">preview</i>
        <span>Preview AI Image</span>
      </button>
    </div>

    <dialog :class="{ active: previewUrl !== null }">
      <h5>AI Input Preview</h5>
      <p class="small-text">
        This is the image sent to the AI model (magenta checkerboard marks the
        edit area).
      </p>
      <img
        v-if="previewUrl"
        :src="previewUrl"
        alt="AI input preview"
        class="responsive"
        style="max-width: 100%; border-radius: 0.5rem"
      />
      <nav>
        <button class="border" @click="closePreview">Close</button>
      </nav>
    </dialog>
  </main>
</template>
