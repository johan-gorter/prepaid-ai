<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const fileInput = ref<HTMLInputElement | null>(null);
const pasteError = ref<string | null>(null);

// Used by E2E tests via setInputFiles — reads the file and navigates directly
// to the mask step, bypassing the live camera page.
function onCameraSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    sessionStorage.setItem("croppedImage", dataUrl);
    router.push("/renovation/new?source=camera");
  };
  reader.readAsDataURL(file);
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    sessionStorage.setItem("cropImage", dataUrl);
    router.push("/renovation/crop");
  };
  reader.readAsDataURL(file);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

async function onPasteImage() {
  pasteError.value = null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith("image/"));
      if (imageType) {
        const blob = await item.getType(imageType);
        const dataUrl = await blobToDataUrl(blob);
        sessionStorage.setItem("cropImage", dataUrl);
        router.push("/renovation/crop");
        return;
      }
    }
    pasteError.value = "No image found on clipboard";
  } catch {
    pasteError.value = "Could not access clipboard";
  }
}
</script>

<template>
  <article class="round center-align" data-testid="new-renovation-card">
    <i class="extra" aria-hidden="true">photo_camera</i>
    <h5>New Renovation</h5>
    <nav class="vertical">
      <button class="small-round" @click="router.push('/renovation/camera')">
        <i aria-hidden="true">photo_camera</i>
        <span>Take Photo</span>
      </button>
      <button class="small-round" @click="fileInput?.click()">
        <i aria-hidden="true">upload</i>
        <span>Upload Image</span>
      </button>
      <button class="small-round" data-testid="paste-image-btn" @click="onPasteImage">
        <i aria-hidden="true">content_paste</i>
        <span>Paste Image</span>
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
}
nav button {
  padding: 1rem;
  width: calc(100% - 2rem);
}
</style>
