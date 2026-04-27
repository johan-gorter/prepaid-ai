<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppBar from "../components/AppBar.vue";
import StickyFooter from "../components/StickyFooter.vue";
import {
  clearUncroppedSource,
  getUncroppedSource,
  setImpressionSource,
} from "../composables/useImpressionStore";

const router = useRouter();

const CANVAS_SIZE = 1024;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const wrapperRef = ref<HTMLElement | null>(null);
const loadedImage = ref<HTMLImageElement | null>(null);
const errorMessage = ref<string | null>(null);

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

onMounted(async () => {
  const blob = await getUncroppedSource();
  if (!blob) {
    errorMessage.value = "No image to crop. Please go back and try again.";
    return;
  }

  objectUrl = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    loadedImage.value = img;
    const coverScale = Math.max(
      CANVAS_SIZE / img.naturalWidth,
      CANVAS_SIZE / img.naturalHeight,
    );
    scale.value = coverScale;
    offsetX.value = (CANVAS_SIZE - img.naturalWidth * coverScale) / 2;
    offsetY.value = (CANVAS_SIZE - img.naturalHeight * coverScale) / 2;
    renderCanvas();
  };
  img.src = objectUrl;

  resizeObserver = new ResizeObserver(() => renderCanvas());
  const wrapper = wrapperRef.value;
  if (wrapper) {
    resizeObserver.observe(wrapper);
    wrapper.addEventListener("touchstart", onTouchStart, { passive: false });
    wrapper.addEventListener("touchmove", onTouchMove, { passive: false });
    wrapper.addEventListener("touchend", onTouchEnd);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  const wrapper = wrapperRef.value;
  if (wrapper) {
    wrapper.removeEventListener("touchstart", onTouchStart);
    wrapper.removeEventListener("touchmove", onTouchMove);
    wrapper.removeEventListener("touchend", onTouchEnd);
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
});

function renderCanvas() {
  const canvas = canvasRef.value;
  const img = loadedImage.value;
  if (!canvas || !img) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const w = img.naturalWidth * scale.value;
  const h = img.naturalHeight * scale.value;
  ctx.drawImage(img, offsetX.value, offsetY.value, w, h);
}

function getCanvasCoords(e: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE,
    y: ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE,
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

function onWheel(e: WheelEvent) {
  e.preventDefault();
  const img = loadedImage.value;
  if (!img) return;

  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();

  const px = ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE;
  const py = ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE;

  const oldScale = scale.value;
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const minScale =
    Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight) *
    0.5;
  const maxScale = minScale * 10;
  scale.value = Math.min(maxScale, Math.max(minScale, oldScale * factor));

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
  const minScale =
    Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight) *
    0.5;
  const maxScale = minScale * 10;
  scale.value = Math.min(maxScale, Math.max(minScale, oldScale * factor));

  const cx = CANVAS_SIZE / 2;
  const cy = CANVAS_SIZE / 2;
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
    x: ((clientX - rect.left) / rect.width) * CANVAS_SIZE,
    y: ((clientY - rect.top) / rect.height) * CANVAS_SIZE,
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
  const minScale =
    Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight) *
    0.5;
  const maxScale = minScale * 10;
  scale.value = Math.min(maxScale, Math.max(minScale, oldScale * factor));

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

async function handleConfirm() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/webp",
    ),
  );
  await setImpressionSource(blob);
  await clearUncroppedSource();
  router.push("/new-impression?source=crop");
}

async function handleCancel() {
  await clearUncroppedSource();
  router.push("/renovations");
}
</script>

<template>
  <div class="page-layout">
    <AppBar title="Crop &amp; Scale" />

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
        <i aria-hidden="true" style="font-size: 3rem">image_not_supported</i>
        <p>{{ errorMessage }}</p>
        <button class="small-round" @click="handleCancel">
          <i aria-hidden="true">arrow_back</i>
          <span>Back</span>
        </button>
      </div>
      <template v-else>
        <p class="center-align small-text">
          Drag to reposition. Use zoom controls or scroll to resize.
        </p>
        <div ref="wrapperRef" class="canvas-wrapper" @wheel.prevent="onWheel">
          <canvas
            ref="canvasRef"
            :width="CANVAS_SIZE"
            :height="CANVAS_SIZE"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
          ></canvas>
        </div>
        <nav class="center-align" style="margin-top: 0.5rem">
          <button
            class="transparent circle"
            @click="zoomOut"
            aria-label="Zoom out"
          >
            <i aria-hidden="true">remove</i>
          </button>
          <button
            class="transparent circle"
            @click="zoomIn"
            aria-label="Zoom in"
          >
            <i aria-hidden="true">add</i>
          </button>
        </nav>
      </template>
    </main>

    <StickyFooter v-if="!errorMessage">
      <button class="max border small-round" @click="handleCancel">
        <i aria-hidden="true">close</i>
        <span>Cancel</span>
      </button>
      <div class="small-space"></div>
      <button
        class="max small-round"
        :disabled="!loadedImage"
        @click="handleConfirm"
      >
        <i aria-hidden="true">check</i>
        <span>Use Image</span>
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

.error-panel {
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}
</style>
