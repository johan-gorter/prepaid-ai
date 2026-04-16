<script setup lang="ts">
import { onMounted, ref, watch } from "vue";

const props = defineProps<{
  imageUrl: string;
}>();

// Brush algorithm constants
const SMALL_RADIUS = 10;
const LARGE_RADIUS = 15;
const SAMPLING_DEGREES = 5;

// Visual translucency of the mask overlay
const MASK_ALPHA = 0.4;

const canvasRef = ref<HTMLCanvasElement | null>(null);

let maskCanvas: HTMLCanvasElement | null = null;
let maskCtx: CanvasRenderingContext2D | null = null;
let sourceImage: HTMLImageElement | null = null;
let canvasWidth = 0;
let canvasHeight = 0;
let isDrawing = false;

async function loadImage(url: string) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });

  sourceImage = img;
  canvasWidth = img.naturalWidth;
  canvasHeight = img.naturalHeight;

  const canvas = canvasRef.value;
  if (!canvas) return;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvasWidth;
  maskCanvas.height = canvasHeight;
  maskCtx = maskCanvas.getContext("2d");

  render();
}

function render() {
  const canvas = canvasRef.value;
  if (!canvas || !sourceImage || !maskCanvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(sourceImage, 0, 0, canvasWidth, canvasHeight);
  ctx.save();
  ctx.globalAlpha = MASK_ALPHA;
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();
}

function clearMask() {
  if (!maskCtx) return;
  maskCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  render();
}

function getCanvasCoords(e: PointerEvent): { x: number; y: number } | null {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: ((e.clientX - rect.left) / rect.width) * canvasWidth,
    y: ((e.clientY - rect.top) / rect.height) * canvasHeight,
  };
}

function paintAt(x: number, y: number) {
  if (!maskCtx) return;

  // Snapshot the pre-existing mask inside a bounding box around the touch
  // point so we can hit-test every triangle corner against the same "before"
  // state, regardless of the order in which triangles are drawn.
  const margin = Math.ceil(LARGE_RADIUS) + 2;
  const sx = Math.max(0, Math.floor(x - margin));
  const sy = Math.max(0, Math.floor(y - margin));
  const ex = Math.min(canvasWidth, Math.ceil(x + margin));
  const ey = Math.min(canvasHeight, Math.ceil(y + margin));
  const sw = ex - sx;
  const sh = ey - sy;

  let pre: ImageData | null = null;
  if (sw > 0 && sh > 0) {
    pre = maskCtx.getImageData(sx, sy, sw, sh);
  }

  function isInsidePreMask(px: number, py: number): boolean {
    if (!pre) return false;
    const ix = Math.round(px) - sx;
    const iy = Math.round(py) - sy;
    if (ix < 0 || iy < 0 || ix >= sw || iy >= sh) return false;
    const alpha = pre.data[(iy * sw + ix) * 4 + 3] ?? 0;
    return alpha > 0;
  }

  maskCtx.fillStyle = "rgb(255, 0, 0)";

  const stepRad = (SAMPLING_DEGREES * Math.PI) / 180;
  const steps = Math.round((2 * Math.PI) / stepRad);

  for (let i = 0; i < steps; i++) {
    const a1 = i * stepRad;
    const a2 = (i + 1) * stepRad;

    // Candidate large-radius corners.
    const lx1 = x + LARGE_RADIUS * Math.cos(a1);
    const ly1 = y + LARGE_RADIUS * Math.sin(a1);
    const lx2 = x + LARGE_RADIUS * Math.cos(a2);
    const ly2 = y + LARGE_RADIUS * Math.sin(a2);

    const bothInside =
      isInsidePreMask(lx1, ly1) && isInsidePreMask(lx2, ly2);

    let cx1: number, cy1: number, cx2: number, cy2: number;
    if (bothInside) {
      cx1 = lx1;
      cy1 = ly1;
      cx2 = lx2;
      cy2 = ly2;
    } else {
      cx1 = x + SMALL_RADIUS * Math.cos(a1);
      cy1 = y + SMALL_RADIUS * Math.sin(a1);
      cx2 = x + SMALL_RADIUS * Math.cos(a2);
      cy2 = y + SMALL_RADIUS * Math.sin(a2);
    }

    maskCtx.beginPath();
    maskCtx.moveTo(x, y);
    maskCtx.lineTo(cx1, cy1);
    maskCtx.lineTo(cx2, cy2);
    maskCtx.closePath();
    maskCtx.fill();
  }

  render();
}

function onPointerDown(e: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return;
  canvas.setPointerCapture(e.pointerId);
  isDrawing = true;
  const coords = getCanvasCoords(e);
  if (coords) paintAt(coords.x, coords.y);
}

function onPointerMove(e: PointerEvent) {
  if (!isDrawing) return;
  const coords = getCanvasCoords(e);
  if (coords) paintAt(coords.x, coords.y);
}

function onPointerUp(e: PointerEvent) {
  const canvas = canvasRef.value;
  if (canvas && canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
  isDrawing = false;
}

defineExpose({ clearMask });

onMounted(() => {
  loadImage(props.imageUrl);
});

watch(
  () => props.imageUrl,
  (url) => {
    loadImage(url);
  },
);
</script>

<template>
  <div class="masking-wrapper" data-testid="masking-canvas">
    <canvas
      ref="canvasRef"
      class="masking-canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    ></canvas>
  </div>
</template>

<style scoped>
.masking-wrapper {
  position: relative;
  width: 100%;
  max-width: 512px;
  margin: 0 auto;
  background: #000;
  touch-action: none;
  border-radius: 0.5rem;
  overflow: hidden;
}

.masking-canvas {
  display: block;
  width: 100%;
  height: auto;
}
</style>
