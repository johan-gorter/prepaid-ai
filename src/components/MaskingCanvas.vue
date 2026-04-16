<script setup lang="ts">
import { onMounted, ref, watch } from "vue";

const props = defineProps<{
  imageUrl: string;
}>();

// Brush algorithm constants
const SMALL_RADIUS = 10;
const LARGE_RADIUS = 15;
const SAMPLING_DEGREES = 5;
const PADDING = 16;

// Visual translucency of the mask overlay
const MASK_ALPHA = 0.4;

const canvasRef = ref<HTMLCanvasElement | null>(null);

let maskCanvas: HTMLCanvasElement | null = null;
let maskCtx: CanvasRenderingContext2D | null = null;
let borderCanvas: HTMLCanvasElement | null = null;
let borderCtx: CanvasRenderingContext2D | null = null;
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
  canvasWidth = img.naturalWidth + PADDING * 2;
  canvasHeight = img.naturalHeight + PADDING * 2;

  const canvas = canvasRef.value;
  if (!canvas) return;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvasWidth;
  maskCanvas.height = canvasHeight;
  maskCtx = maskCanvas.getContext("2d");

  borderCanvas = document.createElement("canvas");
  borderCanvas.width = canvasWidth;
  borderCanvas.height = canvasHeight;
  borderCtx = borderCanvas.getContext("2d");

  render();
}

function render() {
  const canvas = canvasRef.value;
  if (!canvas || !sourceImage || !maskCanvas || !borderCanvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(
    sourceImage,
    PADDING,
    PADDING,
    sourceImage.naturalWidth,
    sourceImage.naturalHeight,
  );
  ctx.save();
  ctx.globalAlpha = MASK_ALPHA;
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();
  ctx.drawImage(borderCanvas, 0, 0);
}

function clearMask() {
  if (!maskCtx || !borderCtx) return;
  maskCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  borderCtx.clearRect(0, 0, canvasWidth, canvasHeight);
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

  // First pass: determine the radius for each triangle.
  const radii: number[] = new Array(steps);
  for (let i = 0; i < steps; i++) {
    const a1 = i * stepRad;
    const a2 = (i + 1) * stepRad;
    const bothInside =
      isInsidePreMask(x + LARGE_RADIUS * Math.cos(a1), y + LARGE_RADIUS * Math.sin(a1)) &&
      isInsidePreMask(x + LARGE_RADIUS * Math.cos(a2), y + LARGE_RADIUS * Math.sin(a2));
    radii[i] = bothInside ? LARGE_RADIUS : SMALL_RADIUS;
  }

  // Second pass: draw triangles.
  for (let i = 0; i < steps; i++) {
    const a1 = i * stepRad;
    const a2 = (i + 1) * stepRad;
    const r = radii[i]!;

    maskCtx.beginPath();
    maskCtx.moveTo(x, y);
    maskCtx.lineTo(x + r * Math.cos(a1), y + r * Math.sin(a1));
    maskCtx.lineTo(x + r * Math.cos(a2), y + r * Math.sin(a2));
    maskCtx.closePath();
    maskCtx.fill();
  }

  // Third pass: smoothing triangles at large↔small transitions.
  // When a large triangle neighbours a small triangle, fill the step with a
  // bevel triangle whose vertices are: the large-radius corner at the shared
  // angle, the small-radius corner at the shared angle, and the far corner of
  // the small triangle (one angular step away on the small side).
  for (let i = 0; i < steps; i++) {
    const next = (i + 1) % steps;
    if (radii[i] === radii[next]) continue;

    const sharedAngle = (i + 1) * stepRad;
    const cosA = Math.cos(sharedAngle);
    const sinA = Math.sin(sharedAngle);

    // Large-radius point and small-radius point at the shared angle.
    const lx = x + LARGE_RADIUS * cosA;
    const ly = y + LARGE_RADIUS * sinA;
    const smx = x + SMALL_RADIUS * cosA;
    const smy = y + SMALL_RADIUS * sinA;

    // Far corner of the small triangle (one step away on the small side).
    let farAngle: number;
    if (radii[i] === LARGE_RADIUS) {
      // large→small: small triangle is on the "next" side
      farAngle = (next + 1) * stepRad;
    } else {
      // small→large: small triangle is on the "i" side
      farAngle = i * stepRad;
    }
    const fx = x + SMALL_RADIUS * Math.cos(farAngle);
    const fy = y + SMALL_RADIUS * Math.sin(farAngle);

    maskCtx.beginPath();
    maskCtx.moveTo(lx, ly);
    maskCtx.lineTo(smx, smy);
    maskCtx.lineTo(fx, fy);
    maskCtx.closePath();
    maskCtx.fill();
  }

  updateBorder(x, y);
  render();
}

/**
 * Recompute the border layer inside a large-radius square around (cx, cy).
 * A masked pixel that is adjacent (4-connected) to a non-masked pixel becomes
 * a solid red border pixel.
 */
function updateBorder(cx: number, cy: number) {
  if (!maskCtx || !borderCtx) return;

  const r = LARGE_RADIUS;

  // Update region (the touched area).
  const ux = Math.max(0, Math.floor(cx - r));
  const uy = Math.max(0, Math.floor(cy - r));
  const uex = Math.min(canvasWidth, Math.ceil(cx + r));
  const uey = Math.min(canvasHeight, Math.ceil(cy + r));
  const uw = uex - ux;
  const uh = uey - uy;
  if (uw <= 0 || uh <= 0) return;

  // Sample the mask 1px larger so neighbour lookups never go out of bounds.
  const msx = Math.max(0, ux - 1);
  const msy = Math.max(0, uy - 1);
  const mex = Math.min(canvasWidth, uex + 1);
  const mey = Math.min(canvasHeight, uey + 1);
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
  max-width: 544px;
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
