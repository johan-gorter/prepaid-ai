<script setup lang="ts">
/**
 * Reusable camera capture surface. Pure mechanics: it opens the rear camera,
 * shows the live preview, and exposes `capture()` for the host to call from its
 * own button — it does NOT touch IndexedDB, navigate, or own any surrounding
 * copy. The host (the room-photo PhotoCapturePage, the wizard material stage, …)
 * supplies the title/hints/footer so each use case keeps its own text and funnel
 * events.
 *
 * Extracted from PhotoCapturePage so the same capture UX can back multiple
 * flows; see docs/photo-input.md.
 */
import { onMounted, onUnmounted, ref } from "vue";

const props = withDefaults(defineProps<{ size?: number }>(), { size: 1024 });
const emit = defineEmits<{
  /** A square WebP frame was captured. The stream is stopped before this fires. */
  capture: [Blob];
  /** Camera access was denied or unavailable. */
  error: [];
  /** The live preview is ready (host can enable its capture button). */
  ready: [boolean];
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
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
      video.onloadedmetadata = () => emit("ready", true);
    }
  } catch {
    emit("error");
  }
});

onUnmounted(stopStream);

function stopStream() {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
}

/** Grab a square centre-crop of the current frame. Host calls this on tap. */
async function capture() {
  const video = videoRef.value;
  const canvas = canvasRef.value;
  if (!video || !canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const sq = Math.min(vw, vh);
  const sx = (vw - sq) / 2;
  const sy = (vh - sq) / 2;

  canvas.width = props.size;
  canvas.height = props.size;
  ctx.drawImage(video, sx, sy, sq, sq, 0, 0, props.size, props.size);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/webp",
    ),
  );
  stopStream();
  emit("capture", blob);
}

defineExpose({ capture });
</script>

<template>
  <div class="camera-wrapper">
    <video
      ref="videoRef"
      autoplay
      playsinline
      muted
      data-testid="camera-preview"
    ></video>
    <canvas ref="canvasRef" style="display: none"></canvas>
  </div>
</template>

<style scoped>
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
</style>
