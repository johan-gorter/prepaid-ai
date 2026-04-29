<script setup lang="ts">
import { onMounted, ref, watch } from "vue";

const props = defineProps<{
  imageUrl: string;
  initialMask?: Blob | null;
}>();

// Brush algorithm constants
const SMALL_RADIUS = 30;
const LARGE_RADIUS = 60;
const SAMPLING_DEGREES = 5;
const PADDING = 16;
const CANVAS_SIZE = 1024;

// Visual translucency of the mask overlay
const MASK_ALPHA = 0.4;

const canvasRef = ref<HTMLCanvasElement | null>(null);

let maskCanvas: HTMLCanvasElement | null = null;
let maskCtx: CanvasRenderingContext2D | null = null;
let borderCanvas: HTMLCanvasElement | null = null;
let borderCtx: CanvasRenderingContext2D | null = null;
let sourceImage: HTMLImageElement | null = null;
let fullWidth = 0;
let fullHeight = 0;
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
  fullWidth = CANVAS_SIZE + PADDING * 2;
  fullHeight = CANVAS_SIZE + PADDING * 2;

  const canvas = canvasRef.value;
  if (!canvas) return;
  canvas.width = fullWidth;
  canvas.height = fullHeight;

  maskCanvas = document.createElement("canvas");
  maskCanvas.width = fullWidth;
  maskCanvas.height = fullHeight;
  maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  if (maskCtx) maskCtx.imageSmoothingEnabled = false;

  borderCanvas = document.createElement("canvas");
  borderCanvas.width = fullWidth;
  borderCanvas.height = fullHeight;
  borderCtx = borderCanvas.getContext("2d");
  if (borderCtx) borderCtx.imageSmoothingEnabled = false;

  render();

  if (props.initialMask) {
    await loadMaskFromBlob(props.initialMask);
  }
}

function render() {
  const canvas = canvasRef.value;
  if (!canvas || !sourceImage || !maskCanvas || !borderCanvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const bg = getComputedStyle(canvas).backgroundColor || "#000";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, fullWidth, fullHeight);
  ctx.drawImage(sourceImage, PADDING, PADDING, CANVAS_SIZE, CANVAS_SIZE);
  ctx.save();
  ctx.globalAlpha = MASK_ALPHA;
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();
  ctx.drawImage(borderCanvas, 0, 0);
}

function clearMask() {
  if (!maskCtx || !borderCtx) return;
  maskCtx.clearRect(0, 0, fullWidth, fullHeight);
  borderCtx.clearRect(0, 0, fullWidth, fullHeight);
  render();
}

function getCanvasCoords(e: PointerEvent): { x: number; y: number } | null {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: ((e.clientX - rect.left) / rect.width) * fullWidth,
    y: ((e.clientY - rect.top) / rect.height) * fullHeight,
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
  const ex = Math.min(fullWidth, Math.ceil(x + margin));
  const ey = Math.min(fullHeight, Math.ceil(y + margin));
  const sw = ex - sx;
  const sh = ey - sy;

  let pre: ImageData | null = null;
  if (sw > 0 && sh > 0) {
    pre = maskCtx.getImageData(sx, sy, sw, sh);
  }

  function isInsidePreMask(px: number, py: number): boolean {
    if (!pre) return false;
    const rpx = Math.round(px);
    const rpy = Math.round(py);
    if (
      rpx < PADDING ||
      rpx >= PADDING + CANVAS_SIZE ||
      rpy < PADDING ||
      rpy >= PADDING + CANVAS_SIZE
    )
      return true;
    const ix = rpx - sx;
    const iy = rpy - sy;
    if (ix < 0 || iy < 0 || ix >= sw || iy >= sh) return false;
    const alpha = pre.data[(iy * sw + ix) * 4 + 3] ?? 0;
    return alpha > 0;
  }

  // Clip all mask drawing to the image region (no painting in the padding).
  maskCtx.save();
  maskCtx.beginPath();
  maskCtx.rect(PADDING, PADDING, CANVAS_SIZE, CANVAS_SIZE);
  maskCtx.clip();

  maskCtx.fillStyle = "rgb(255, 0, 0)";

  const stepRad = (SAMPLING_DEGREES * Math.PI) / 180;
  const steps = Math.round((2 * Math.PI) / stepRad);

  // First pass: determine the radius for each triangle.
  const radii: number[] = new Array(steps);
  for (let i = 0; i < steps; i++) {
    const a1 = i * stepRad;
    const a2 = (i + 1) * stepRad;
    const bothInside =
      isInsidePreMask(
        x + LARGE_RADIUS * Math.cos(a1),
        y + LARGE_RADIUS * Math.sin(a1),
      ) &&
      isInsidePreMask(
        x + LARGE_RADIUS * Math.cos(a2),
        y + LARGE_RADIUS * Math.sin(a2),
      );
    radii[i] = bothInside ? LARGE_RADIUS : SMALL_RADIUS;
  }

  // Second pass: draw triangles as a single path to avoid anti-aliasing gaps.
  maskCtx.beginPath();
  for (let i = 0; i < steps; i++) {
    const a1 = i * stepRad;
    const a2 = (i + 1) * stepRad;
    const r = radii[i]!;

    maskCtx.moveTo(x, y);
    maskCtx.lineTo(x + r * Math.cos(a1), y + r * Math.sin(a1));
    maskCtx.lineTo(x + r * Math.cos(a2), y + r * Math.sin(a2));
    maskCtx.closePath();
  }
  maskCtx.fill();

  // Third pass: smoothing triangles at large↔small transitions.
  maskCtx.beginPath();
  for (let i = 0; i < steps; i++) {
    const next = (i + 1) % steps;
    if (radii[i] === radii[next]) continue;

    const sharedAngle = (i + 1) * stepRad;

    let farAngle: number;
    if (radii[i] === LARGE_RADIUS) {
      farAngle = (next + 1) * stepRad;
    } else {
      farAngle = i * stepRad;
    }
    const angleOnSmallRadius =
      sharedAngle + ((farAngle - sharedAngle) / SAMPLING_DEGREES) * 60;

    const lx = x + LARGE_RADIUS * Math.cos(sharedAngle);
    const ly = y + LARGE_RADIUS * Math.sin(sharedAngle);
    const smx = x + SMALL_RADIUS * Math.cos(angleOnSmallRadius);
    const smy = y + SMALL_RADIUS * Math.sin(angleOnSmallRadius);
    const fx = x;
    const fy = y;

    maskCtx.moveTo(lx, ly);
    maskCtx.lineTo(smx, smy);
    maskCtx.lineTo(fx, fy);
    maskCtx.closePath();
  }
  maskCtx.fill();

  maskCtx.restore();

  // Threshold: snap any anti-aliased alpha to fully opaque for a crisp mask.
  const tx = Math.max(0, Math.floor(x - LARGE_RADIUS - 1));
  const ty = Math.max(0, Math.floor(y - LARGE_RADIUS - 1));
  const tw = Math.min(fullWidth, Math.ceil(x + LARGE_RADIUS + 1)) - tx;
  const th = Math.min(fullHeight, Math.ceil(y + LARGE_RADIUS + 1)) - ty;
  if (tw > 0 && th > 0) {
    const imgData = maskCtx.getImageData(tx, ty, tw, th);
    const d = imgData.data;
    for (let j = 3, len = d.length; j < len; j += 4) {
      d[j] = d[j]! > 0 ? 255 : 0;
    }
    maskCtx.putImageData(imgData, tx, ty);
  }

  updateBorder(x, y);
  render();
}

function updateBorder(cx: number, cy: number) {
  if (!maskCtx || !borderCtx) return;

  const r = LARGE_RADIUS;

  // Clamp update region to the image area only.
  const imgEnd = PADDING + CANVAS_SIZE;
  const ux = Math.max(PADDING, Math.floor(cx - r));
  const uy = Math.max(PADDING, Math.floor(cy - r));
  const uex = Math.min(imgEnd, Math.ceil(cx + r));
  const uey = Math.min(imgEnd, Math.ceil(cy + r));
  const uw = uex - ux;
  const uh = uey - uy;
  if (uw <= 0 || uh <= 0) return;

  // Sample the mask 1px larger so neighbour lookups never go out of bounds.
  const msx = Math.max(0, ux - 1);
  const msy = Math.max(0, uy - 1);
  const mex = Math.min(fullWidth, uex + 1);
  const mey = Math.min(fullHeight, uey + 1);
  const msw = mex - msx;
  const msh = mey - msy;
  const maskData = maskCtx.getImageData(msx, msy, msw, msh);

  function maskAlpha(gx: number, gy: number): number {
    const lx = gx - msx;
    const ly = gy - msy;
    if (lx < 0 || ly < 0 || lx >= msw || ly >= msh) return 0;
    return maskData.data[(ly * msw + lx) * 4 + 3] ?? 0;
  }

  const borderData = borderCtx.getImageData(ux, uy, uw, uh);

  for (let j = 0; j < uh; j++) {
    for (let i = 0; i < uw; i++) {
      const gx = ux + i;
      const gy = uy + j;
      const idx = (j * uw + i) * 4;

      let isBorder = false;
      if (maskAlpha(gx, gy) > 0) {
        if (
          maskAlpha(gx - 1, gy) === 0 ||
          maskAlpha(gx + 1, gy) === 0 ||
          maskAlpha(gx, gy - 1) === 0 ||
          maskAlpha(gx, gy + 1) === 0
        ) {
          isBorder = true;
        }
      }

      borderData.data[idx] = isBorder ? 255 : 0;
      borderData.data[idx + 1] = 0;
      borderData.data[idx + 2] = 0;
      borderData.data[idx + 3] = isBorder ? 255 : 0;
    }
  }

  borderCtx.putImageData(borderData, ux, uy);
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

function getOriginalBlob(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!sourceImage) {
      reject(new Error("Image not loaded"));
      return;
    }
    const c = document.createElement("canvas");
    c.width = CANVAS_SIZE;
    c.height = CANVAS_SIZE;
    const ctx = c.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas context unavailable"));
      return;
    }
    ctx.drawImage(sourceImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    c.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
    );
  });
}

// Size of each checkerboard cell (px) used for the AI-facing composite.
const CHECKER_CELL = 10;
// Opaque magenta, a color that almost never appears in natural scenes.
const CHECKER_COLOR = "rgb(255, 0, 255)";

function getCompositeBlob(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!sourceImage || !maskCanvas) {
      reject(new Error("Canvas not initialized"));
      return;
    }

    // 1) Result canvas starts with the source image.
    const c = document.createElement("canvas");
    c.width = CANVAS_SIZE;
    c.height = CANVAS_SIZE;
    const ctx = c.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas context unavailable"));
      return;
    }
    ctx.drawImage(sourceImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 2) Build a magenta-checkerboard layer, sized to the image region.
    const checker = document.createElement("canvas");
    checker.width = CANVAS_SIZE;
    checker.height = CANVAS_SIZE;
    const checkerCtx = checker.getContext("2d");
    if (!checkerCtx) {
      reject(new Error("Checker context unavailable"));
      return;
    }
    checkerCtx.fillStyle = CHECKER_COLOR;
    for (let y = 0; y < CANVAS_SIZE; y += CHECKER_CELL) {
      for (let x = 0; x < CANVAS_SIZE; x += CHECKER_CELL) {
        const cellX = Math.floor(x / CHECKER_CELL);
        const cellY = Math.floor(y / CHECKER_CELL);
        if ((cellX + cellY) % 2 === 0) {
          checkerCtx.fillRect(x, y, CHECKER_CELL, CHECKER_CELL);
        }
      }
    }

    // 3) Clip the checkerboard to the mask shape: keep pattern pixels only
    // where the user painted. destination-in keeps existing pixels only
    // where the incoming drawing is opaque.
    checkerCtx.globalCompositeOperation = "destination-in";
    checkerCtx.drawImage(
      maskCanvas,
      PADDING,
      PADDING,
      CANVAS_SIZE,
      CANVAS_SIZE,
      0,
      0,
      CANVAS_SIZE,
      CANVAS_SIZE,
    );

    // 4) Overlay the masked checkerboard onto the source image.
    ctx.drawImage(checker, 0, 0);

    c.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
    );
  });
}

function getMaskBlob(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!maskCanvas) {
      resolve(null);
      return;
    }
    maskCanvas.toBlob((blob) => resolve(blob), "image/webp");
  });
}

function rebuildBorder() {
  if (!borderCtx || !maskCtx) return;
  borderCtx.clearRect(0, 0, fullWidth, fullHeight);
  const maskData = maskCtx.getImageData(0, 0, fullWidth, fullHeight);
  const borderData = borderCtx.getImageData(
    PADDING,
    PADDING,
    CANVAS_SIZE,
    CANVAS_SIZE,
  );
  function alphaAt(gx: number, gy: number): number {
    if (gx < 0 || gy < 0 || gx >= fullWidth || gy >= fullHeight) return 0;
    return maskData.data[(gy * fullWidth + gx) * 4 + 3] ?? 0;
  }
  for (let j = 0; j < CANVAS_SIZE; j++) {
    for (let i = 0; i < CANVAS_SIZE; i++) {
      const gx = PADDING + i;
      const gy = PADDING + j;
      const idx = (j * CANVAS_SIZE + i) * 4;
      let isBorder = false;
      if (alphaAt(gx, gy) > 0) {
        if (
          alphaAt(gx - 1, gy) === 0 ||
          alphaAt(gx + 1, gy) === 0 ||
          alphaAt(gx, gy - 1) === 0 ||
          alphaAt(gx, gy + 1) === 0
        ) {
          isBorder = true;
        }
      }
      borderData.data[idx] = isBorder ? 255 : 0;
      borderData.data[idx + 1] = 0;
      borderData.data[idx + 2] = 0;
      borderData.data[idx + 3] = isBorder ? 255 : 0;
    }
  }
  borderCtx.putImageData(borderData, PADDING, PADDING);
}

async function loadMaskFromBlob(blob: Blob): Promise<void> {
  if (!maskCtx || !borderCtx) return;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load mask"));
      img.src = url;
    });
    maskCtx.clearRect(0, 0, fullWidth, fullHeight);
    maskCtx.drawImage(img, 0, 0, fullWidth, fullHeight);
    rebuildBorder();
    render();
  } finally {
    URL.revokeObjectURL(url);
  }
}

defineExpose({
  clearMask,
  getOriginalBlob,
  getCompositeBlob,
  getMaskBlob,
  loadMaskFromBlob,
});

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
  max-width: 544px;
  margin: 0 auto;
  background: var(--surface, #000);
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
