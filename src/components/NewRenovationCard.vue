<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const fileInput = ref<HTMLInputElement | null>(null);
const cameraInput = ref<HTMLInputElement | null>(null);

function onCameraSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    sessionStorage.setItem("croppedImage", dataUrl);
    router.push("/renovation/new?source=cropped");
  };
  reader.readAsDataURL(file);
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;

  // Read the file and navigate to the crop page with the image data
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    // Store in sessionStorage so the crop page can access it
    sessionStorage.setItem("cropImage", dataUrl);
    router.push("/renovation/crop");
  };
  reader.readAsDataURL(file);
}
</script>

<template>
  <article class="round center-align" data-testid="new-renovation-card">
    <i class="extra" aria-hidden="true">photo_camera</i>
    <h5>New Renovation</h5>
    <nav class="vertical">
      <button class="small-round" @click="cameraInput?.click()">
        <i aria-hidden="true">photo_camera</i>
        <span>Take Photo</span>
      </button>
      <button class="small-round" @click="fileInput?.click()">
        <i aria-hidden="true">upload</i>
        <span>Upload Image</span>
      </button>
    </nav>
    <input
      ref="cameraInput"
      data-testid="camera-input"
      type="file"
      accept="image/*"
      capture="environment"
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
