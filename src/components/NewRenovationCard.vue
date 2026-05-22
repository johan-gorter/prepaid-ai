<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import {
  clearImpressionDraft,
  clearImpressionMask,
  setImpressionSource,
  setUncroppedSource,
} from "../composables/useImpressionStore";

const { t } = useI18n();
const router = useRouter();
const fileInput = ref<HTMLInputElement | null>(null);
const pasteError = ref<string | null>(null);

// Used by E2E tests via setInputFiles — bypasses the live camera page by
// stashing the file as the impression source and going straight to the mask
// stage of the unified wizard.
async function onCameraSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  await setImpressionSource(file);
  await Promise.all([clearImpressionMask(), clearImpressionDraft()]);
  router.push("/new-impression?source=photo");
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  await setUncroppedSource(file);
  router.push("/crop");
}

async function onPasteImage() {
  pasteError.value = null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith("image/"));
      if (imageType) {
        const blob = await item.getType(imageType);
        await setUncroppedSource(blob);
        router.push("/crop");
        return;
      }
    }
    pasteError.value = t("newRenovation.noImageClipboard");
  } catch {
    pasteError.value = t("newRenovation.clipboardError");
  }
}
</script>

<template>
  <article
    class="new-renovation-card center-align"
    data-testid="new-renovation-card"
  >
    <i class="extra" aria-hidden="true">photo_camera</i>
    <h5>{{ $t("newRenovation.title") }}</h5>
    <nav class="vertical">
      <button class="small-round" @click="router.push('/photo')">
        <i aria-hidden="true">photo_camera</i>
        <span>{{ $t("newRenovation.takePhoto") }}</span>
      </button>
      <button class="small-round" @click="fileInput?.click()">
        <i aria-hidden="true">upload</i>
        <span>{{ $t("newRenovation.uploadImage") }}</span>
      </button>
      <button
        class="small-round"
        data-testid="paste-image-btn"
        @click="onPasteImage"
      >
        <i aria-hidden="true">content_paste</i>
        <span>{{ $t("newRenovation.pasteImage") }}</span>
      </button>
    </nav>
    <p v-if="pasteError" class="error-text small-text">{{ pasteError }}</p>
    <!-- Hidden input kept for E2E test compatibility (setInputFiles bypass) -->
    <input
      data-testid="camera-input"
      type="file"
      accept="image/*"
      hidden
      @change="onCameraSelected"
    />
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      hidden
      @change="onFileSelected"
    />
  </article>
</template>

<style scoped>
article {
  aspect-ratio: 1 / 1;
  margin: 0 !important;
  padding: 16px !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
nav button {
  padding: 1rem;
  width: calc(100% - 2rem);
}
</style>
