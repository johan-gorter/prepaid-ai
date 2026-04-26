<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import StickyFooter from "../components/StickyFooter.vue";
import UserMenu from "../components/UserMenu.vue";
import { setImpressionSource } from "../composables/useImpressionStore";

const router = useRouter();

const CAPTURE_SIZE = 1024;

const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const errorMessage = ref<string | null>(null);
const cameraReady = ref(false);
let stream: MediaStream | null = null;

onMounted(async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    const video = videoRef.value;
    if (video) {
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        cameraReady.value = true;
      };
    }
  } catch {
    errorMessage.value =
      "Camera access denied or unavailable. Please allow camera access and try again.";
  }
});

onUnmounted(() => {
  stopStream();
});

function stopStream() {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
}

async function handleCapture() {
  const video = videoRef.value;
  const canvas = canvasRef.value;
  if (!video || !canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const size = Math.min(vw, vh);
  const sx = (vw - size) / 2;
  const sy = (vh - size) / 2;

  canvas.width = CAPTURE_SIZE;
  canvas.height = CAPTURE_SIZE;
  ctx.drawImage(video, sx, sy, size, size, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/webp",
    ),
  );
  stopStream();
  await setImpressionSource(blob);
  router.push("/new-impression?source=photo");
}

function handleCancel() {
  stopStream();
  router.push("/renovations");
}
</script>

<template>
  <div class="page-layout">
    <header class="fixed">
      <nav>
        <button
          class="transparent circle"
          @click="handleCancel"
          aria-label="← Back"
        >
          <i aria-hidden="true">arrow_back</i>
        </button>
        <h1 class="max">Take Photo</h1>
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
      <div v-if="errorMessage" class="error-panel center-align">
        <i aria-hidden="true" style="font-size: 3rem">no_photography</i>
        <p>{{ errorMessage }}</p>
      </div>
      <template v-else>
        <p class="center-align small-text">
          Position your subject inside the square, then tap Capture.
        </p>
        <div class="camera-wrapper">
          <video
            ref="videoRef"
            autoplay
            playsinline
            muted
            data-testid="camera-preview"
          ></video>
        </div>
      </template>
      <canvas ref="canvasRef" style="display: none"></canvas>
    </main>

    <StickyFooter>
      <button class="max border small-round" @click="handleCancel">
        <i aria-hidden="true">close</i>
        <span>Cancel</span>
      </button>
      <div class="small-space"></div>
      <button
        class="max small-round"
        :disabled="!cameraReady"
        @click="handleCapture"
        aria-label="Capture photo"
      >
        <i aria-hidden="true">camera</i>
        <span>Capture</span>
      </button>
    </StickyFooter>
  </div>
</template>

<style scoped>
.page-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}

.camera-wrapper {
  position: relative;
  width: 100%;
  max-width: 500px;
  aspect-ratio: 1 / 1;
  background: #000;
  border-radius: 0.5rem;
  overflow: hidden;
  margin: 0 auto;
}

.camera-wrapper video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.error-panel {
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}
</style>
