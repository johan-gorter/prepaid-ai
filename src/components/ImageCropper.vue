<script setup lang="ts">
/**
 * Reusable square crop canvas (pan / zoom / pinch). Pure mechanics: it takes a
 * source Blob and exposes `getBlob()` for the host to call from its own confirm
 * button — it does NOT touch IndexedDB, navigate, or own any surrounding copy.
 * The host (the room-photo CropImagePage, the wizard material stage, …) supplies
 * the title/hints/footer so each use case keeps its own text and funnel events.
 *
 * Extracted from CropImagePage so the same crop UX can back multiple flows; see
 * docs/photo-input.md.
 */
import { onMounted, onUnmounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    /** Image to crop. */
    source: Blob;
    /** Output edge length in px (square). */
    size?: number;
    zoomInLabel?: string;
    zoomOutLabel?: string;
  }>(),
  { size: 1024, zoomInLabel: "Zoom in", zoomOutLabel: "Zoom out" },
);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const wrapperRef = ref<HTMLElement | null>(null);
const loadedImage = ref<HTMLImageElement | null>(null);

const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartOffsetX = 0;
let dragStartOffsetY = 0;
let resizeObserver: ResizeObserver | null = null;

let lastTouchDist = 0;
let lastTouchCenterX = 0;
let lastTouchCenterY = 0;
let isPinching = false;

let objectUrl: string | null = null;

function revokeUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function loadSource(blob: Blob) {
  revokeUrl();
  objectUrl = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    loadedImage.value = img;
    const coverScale = Math.max(
      props.size / img.naturalWidth,
      props.size / img.naturalHeight,
    );
    scale.value = coverScale;
    offsetX.value = (props.size - img.naturalWidth * coverScale) / 2;
    offsetY.value = (props.size - img.naturalHeight * coverScale) / 2;
    renderCanvas();
  };
  img.src = objectUrl;
}

onMounted(() => {
  loadSource(props.source);

  resizeObserver = new ResizeObserver(() => renderCanvas());
  const wrapper = wrapperRef.value;
  if (wrapper) {
    resizeObserver.observe(wrapper);
    wrapper.addEventListener("touchstart", onTouchStart, { passive: false });
    wrapper.addEventListener("touchmove", onTouchMove, { passive: false });
    wrapper.addEventListener("touchend", onTouchEnd);
  }
});

// Re-load when the host swaps the source (e.g. picking a different upload).
watch(
  () => props.source,
  (next) => loadSource(next),
);

onUnmounted(() => {
  resizeObserver?.disconnect();
  const wrapper = wrapperRef.value;
  if (wrapper) {
    wrapper.removeEventListener("touchstart", onTouchStart);
    wrapper.removeEventListener("touchmove", onTouchMove);
    wrapper.removeEventListener("touchend", onTouchEnd);
  }
  revokeUrl();
});

function renderCanvas() {
  const canvas = canvasRef.value;
  const img = loadedImage.value;
  if (!canvas || !img) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, props.size, props.size);

  const w = img.naturalWidth * scale.value;
  const h = img.naturalHeight * scale.value;
  ctx.drawImage(img, offsetX.value, offsetY.value, w, h);
}

function getCanvasCoords(e: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * props.size,
    y: ((e.clientY - rect.top) / rect.height) * props.size,
  };
}

function onPointerDown(e: PointerEvent) {
  if (isPinching) return;
  isDragging = true;
  const canvas = canvasRef.value;
  if (canvas) canvas.setPointerCapture(e.pointerId);
  const coords = getCanvasCoords(e);
  dragStartX = coords.x;
  dragStartY = coords.y;
  dragStartOffsetX = offsetX.value;
  dragStartOffsetY = offsetY.value;
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging) return;
  const coords = getCanvasCoords(e);
  offsetX.value = dragStartOffsetX + (coords.x - dragStartX);
  offsetY.value = dragStartOffsetY + (coords.y - dragStartY);
  renderCanvas();
}

function onPointerUp() {
  isDragging = false;
}

function minScale(img: HTMLImageElement) {
  return (
    Math.max(props.size / img.naturalWidth, props.size / img.naturalHeight) * 0.5
  );
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  const img = loadedImage.value;
  if (!img) return;

  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();

  const px = ((e.clientX - rect.left) / rect.width) * props.size;
  const py = ((e.clientY - rect.top) / rect.height) * props.size;

  const oldScale = scale.value;
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const min = minScale(img);
  const max = min * 10;
  scale.value = Math.min(max, Math.max(min, oldScale * factor));

  const ratio = scale.value / oldScale;
  offsetX.value = px - (px - offsetX.value) * ratio;
  offsetY.value = py - (py - offsetY.value) * ratio;

  renderCanvas();
}

function zoomIn() {
  adjustZoom(1.25);
}

function zoomOut() {
  adjustZoom(1 / 1.25);
}

function adjustZoom(factor: number) {
  const img = loadedImage.value;
  if (!img) return;

  const oldScale = scale.value;
  const min = minScale(img);
  const max = min * 10;
  scale.value = Math.min(max, Math.max(min, oldScale * factor));

  const cx = props.size / 2;
  const cy = props.size / 2;
  const ratio = scale.value / oldScale;
  offsetX.value = cx - (cx - offsetX.value) * ratio;
  offsetY.value = cy - (cy - offsetY.value) * ratio;

  renderCanvas();
}

function getTouchCanvasCoords(clientX: number, clientY: number) {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * props.size,
    y: ((clientY - rect.top) / rect.height) * props.size,
  };
}

function touchDist(t1: Touch, t2: Touch) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 2) {
    e.preventDefault();
    isPinching = true;
    isDragging = false;
    const t0 = e.touches[0]!;
    const t1 = e.touches[1]!;
    lastTouchDist = touchDist(t0, t1);
    const center = getTouchCanvasCoords(
      (t0.clientX + t1.clientX) / 2,
      (t0.clientY + t1.clientY) / 2,
    );
    lastTouchCenterX = center.x;
    lastTouchCenterY = center.y;
  }
}

function onTouchMove(e: TouchEvent) {
  if (e.touches.length !== 2 || !isPinching) return;
  e.preventDefault();
  const img = loadedImage.value;
  if (!img) return;

  const t0 = e.touches[0]!;
  const t1 = e.touches[1]!;
  const dist = touchDist(t0, t1);
  const center = getTouchCanvasCoords(
    (t0.clientX + t1.clientX) / 2,
    (t0.clientY + t1.clientY) / 2,
  );

  const factor = dist / lastTouchDist;
  const oldScale = scale.value;
  const min = minScale(img);
  const max = min * 10;
  scale.value = Math.min(max, Math.max(min, oldScale * factor));

  const ratio = scale.value / oldScale;
  offsetX.value = center.x - (center.x - offsetX.value) * ratio;
  offsetY.value = center.y - (center.y - offsetY.value) * ratio;

  offsetX.value += center.x - lastTouchCenterX;
  offsetY.value += center.y - lastTouchCenterY;

  lastTouchDist = dist;
  lastTouchCenterX = center.x;
  lastTouchCenterY = center.y;

  renderCanvas();
}

function onTouchEnd(e: TouchEvent) {
  if (e.touches.length < 2) {
    isPinching = false;
  }
}

/** Encode the currently-framed crop as a WebP Blob. Host calls this on confirm. */
async function getBlob(): Promise<Blob> {
  const canvas = canvasRef.value;
  if (!canvas) throw new Error("cropper canvas not ready");
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/webp",
    ),
  );
}

/** Whether a source image has finished decoding (host can gate its confirm). */
const isReady = ref(false);
watch(loadedImage, (img) => (isReady.value = !!img));

defineExpose({ getBlob, isReady });
</script>

<template>
  <div class="cropper">
    <div ref="wrapperRef" class="canvas-wrapper" @wheel.prevent="onWheel">
      <canvas
        ref="canvasRef"
        :width="size"
        :height="size"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
      ></canvas>
    </div>
    <nav class="center-align" style="margin-top: 0.5rem">
      <button
        class="transparent circle"
        @click="zoomOut"
        :aria-label="zoomOutLabel"
      >
        <i aria-hidden="true">remove</i>
      </button>
      <button
        class="transparent circle"
        @click="zoomIn"
        :aria-label="zoomInLabel"
      >
        <i aria-hidden="true">add</i>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.canvas-wrapper {
  position: relative;
  width: 100%;
  max-width: 500px;
  aspect-ratio: 1 / 1;
  background: #000;
  touch-action: none;
  border-radius: 0.5rem;
  overflow: hidden;
  margin: 0 auto;
  cursor: grab;
}

.canvas-wrapper:active {
  cursor: grabbing;
}

.canvas-wrapper canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
