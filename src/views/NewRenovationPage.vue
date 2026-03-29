<script setup lang="ts">
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useRenovations } from "../composables/useRenovations";
import { useImpressions } from "../composables/useImpressions";
import { resolveStorageUrl } from "../composables/useStorageUrl";
import { storage } from "../firebase";

const router = useRouter();
const { createRenovation, createImpression, deleteImpression } = useRenovations();
const { currentUser } = useAuth();

// Step state: 0=Image, 1=Mask, 2=Prompt, 3=Processing, 4=Result
const step = ref(0);
const stepTitles = ["1. Capture Image", "2. Mark Area", "3. Describe Change", "4. Processing", "5. Result"];

const prompt = ref("");
const selectedFile = ref<File | null>(null);
const imagePreview = ref<string | null>(null);
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
const loadedImage = ref<HTMLImageElement | null>(null);

// Created renovation/impression tracking
const createdRenovationId = ref<string | null>(null);
const createdImpressionId = ref<string | null>(null);
const resultImageUrl = ref<string | null>(null);

// Use impressions watcher for result polling
const renovationIdRef = ref("");
const { impressions } = useImpressions(renovationIdRef);

// Watch for impression completion
watch(impressions, (items) => {
  if (!createdImpressionId.value) return;
  const imp = items.find((i) => i.id === createdImpressionId.value);
  if (imp && imp.status === "completed" && imp.resultImagePath) {
    resolveStorageUrl(imp.resultImagePath).then((url) => {
      resultImageUrl.value = url;
    }).catch(() => {});
  }
});

// Mask canvas state
const canvasWrapperRef = ref<HTMLElement | null>(null);
const mainCanvasRef = ref<HTMLCanvasElement | null>(null);
let maskCanvas: HTMLCanvasElement | null = null;
let maskCtx: CanvasRenderingContext2D | null = null;
let sourceCanvas: HTMLCanvasElement | null = null;
let isDrawing = false;
const brushSize = 30;
const CANVAS_SIZE = 1000;
const SQUARE_CROP_RATIO = 0.5;

let resizeObserver: ResizeObserver | null = null;

const canGoNext = computed(() => {
  if (step.value === 0) return !!loadedImage.value;
  if (step.value === 1) return true;
  if (step.value === 2) return prompt.value.trim().length > 0;
  return false;
});

const nextLabel = computed(() => {
  if (step.value === 2) return "Generate";
  return "Next";
});

// Check if the created impression is completed
const impressionCompleted = computed(() => {
  if (!createdImpressionId.value) return false;
  const imp = impressions.value.find((i) => i.id === createdImpressionId.value);
  return imp?.status === "completed";
});

const impressionStatus = computed(() => {
  if (!createdImpressionId.value) return "pending";
  const imp = impressions.value.find((i) => i.id === createdImpressionId.value);
  return imp?.status ?? "pending";
});

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    errorMessage.value = "Please select an image file.";
    return;
  }
  selectedFile.value = file;
  errorMessage.value = null;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string;
    imagePreview.value = dataUrl;
    const img = new Image();
    img.onload = () => {
      loadedImage.value = img;
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

function computeSquareFit(imgW: number, imgH: number, size: number) {
  const aspect = imgW / imgH;
  const r = SQUARE_CROP_RATIO;

  if (Math.abs(aspect - 1) < 0.01) {
    return { sx: 0, sy: 0, sw: imgW, sh: imgH, dx: 0, dy: 0, dw: size, dh: size };
  }

  if (aspect > 1) {
    const letterboxScale = size / imgW;
    const cropScale = size / imgH;
    const scale = letterboxScale + r * (cropScale - letterboxScale);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const sx = drawW > size ? ((drawW - size) / 2) / scale : 0;
    const sy = drawH > size ? ((drawH - size) / 2) / scale : 0;
    const sw = Math.min(imgW, size / scale);
    const sh = Math.min(imgH, size / scale);
    const dw = Math.min(drawW, size);
    const dh = Math.min(drawH, size);
    const dx = (size - dw) / 2;
    const dy = (size - dh) / 2;
    return { sx, sy, sw, sh, dx, dy, dw, dh };
  } else {
    const letterboxScale = size / imgH;
    const cropScale = size / imgW;
    const scale = letterboxScale + r * (cropScale - letterboxScale);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const sx = drawW > size ? ((drawW - size) / 2) / scale : 0;
    const sy = drawH > size ? ((drawH - size) / 2) / scale : 0;
    const sw = Math.min(imgW, size / scale);
    const sh = Math.min(imgH, size / scale);
    const dw = Math.min(drawW, size);
    const dh = Math.min(drawH, size);
    const dx = (size - dw) / 2;
    const dy = (size - dh) / 2;
    return { sx, sy, sw, sh, dx, dy, dw, dh };
  }
}

function initCanvases() {
  const img = loadedImage.value;
  if (!img) return;

  sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = CANVAS_SIZE;
  sourceCanvas.height = CANVAS_SIZE;
  const srcCtx = sourceCanvas.getContext("2d")!;
  srcCtx.fillStyle = "black";
  srcCtx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const fit = computeSquareFit(img.naturalWidth, img.naturalHeight, CANVAS_SIZE);
  srcCtx.drawImage(img, fit.sx, fit.sy, fit.sw, fit.sh, fit.dx, fit.dy, fit.dw, fit.dh);

  maskCanvas = document.createElement("canvas");
  maskCanvas.width = CANVAS_SIZE;
  maskCanvas.height = CANVAS_SIZE;
  maskCtx = maskCanvas.getContext("2d");
}

function renderCanvas() {
  const canvas = mainCanvasRef.value;
  if (!canvas || !sourceCanvas || !maskCanvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.drawImage(maskCanvas, 0, 0);
}

function clearMask() {
  if (!maskCtx) return;
  maskCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  renderCanvas();
}

function getCanvasCoords(e: PointerEvent): { x: number; y: number } | null {
  const canvas = mainCanvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE,
    y: ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE,
  };
}

function onPointerDown(e: PointerEvent) {
  isDrawing = true;
  const canvas = mainCanvasRef.value;
  if (canvas) canvas.setPointerCapture(e.pointerId);
  drawAt(e);
}

function onPointerMove(e: PointerEvent) {
  if (!isDrawing) return;
  drawAt(e);
}

function onPointerUp() {
  isDrawing = false;
}

function drawAt(e: PointerEvent) {
  if (!maskCtx) return;
  const coords = getCanvasCoords(e);
  if (!coords) return;
  maskCtx.fillStyle = "rgba(255, 0, 0, 0.4)";
  maskCtx.beginPath();
  maskCtx.arc(coords.x, coords.y, brushSize, 0, Math.PI * 2);
  maskCtx.fill();
  renderCanvas();
}

function goNext() {
  if (!canGoNext.value) return;
  if (step.value === 1 && !maskCanvas) return;
  step.value++;
  if (step.value === 1) {
    initCanvases();
    requestAnimationFrame(renderCanvas);
  }
  if (step.value === 3) {
    handleSubmit();
  }
}

function goPrev() {
  if (step.value <= 0 || step.value >= 3) return;
  step.value--;
  if (step.value === 1) {
    requestAnimationFrame(renderCanvas);
  }
}

function getCompositeBlob(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx || !sourceCanvas || !maskCanvas) {
      reject(new Error("Canvas not initialized"));
      return;
    }
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.drawImage(maskCanvas, 0, 0);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}

function getOriginalBlob(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (!sourceCanvas) {
      reject(new Error("Source canvas not initialized"));
      return;
    }
    sourceCanvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}

async function handleSubmit() {
  if (!selectedFile.value || !prompt.value.trim()) {
    errorMessage.value = "Please select an image and describe the change.";
    step.value = 0;
    return;
  }
  if (!currentUser.value) {
    errorMessage.value = "You must be signed in.";
    step.value = 0;
    return;
  }

  submitting.value = true;
  errorMessage.value = null;

  try {
    const uid = currentUser.value.uid;
    const timestamp = Date.now();

    const originalImagePath = `users/${uid}/originals/${timestamp}.png`;
    const originalBlob = await getOriginalBlob();
    await uploadBytes(storageRef(storage, originalImagePath), originalBlob);

    const compositeImagePath = `users/${uid}/composites/${timestamp}.png`;
    const compositeBlob = await getCompositeBlob();
    await uploadBytes(storageRef(storage, compositeImagePath), compositeBlob);

    const renovationId = await createRenovation({
      originalImagePath,
    });

    const impressionId = await createImpression(renovationId, {
      sourceImagePath: originalImagePath,
      compositeImagePath,
      prompt: prompt.value.trim(),
    });

    createdRenovationId.value = renovationId;
    createdImpressionId.value = impressionId;
    renovationIdRef.value = renovationId;
    step.value = 4;
  } catch (err: unknown) {
    errorMessage.value =
      err instanceof Error ? err.message : "An unknown error occurred.";
    step.value = 2;
  } finally {
    submitting.value = false;
  }
}

async function handleTrash() {
  if (!createdRenovationId.value || !createdImpressionId.value) return;
  try {
    await deleteImpression(createdRenovationId.value, createdImpressionId.value);
  } catch {
    // Ignore deletion errors
  }
  // Reset to step 1 with same source image
  createdImpressionId.value = null;
  resultImageUrl.value = null;
  prompt.value = "";
  step.value = 1;
  clearMask();
  requestAnimationFrame(renderCanvas);
}

function handleTimeline() {
  if (!createdRenovationId.value) return;
  router.push(`/renovation/${createdRenovationId.value}`);
}

function handleNextChange() {
  if (!createdRenovationId.value || !createdImpressionId.value) return;
  router.push(`/renovation/${createdRenovationId.value}/new?source=${createdImpressionId.value}`);
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    if (step.value === 1) renderCanvas();
  });
  const wrapper = canvasWrapperRef.value;
  if (wrapper) resizeObserver.observe(wrapper);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="new-renovation-page">
    <header class="page-header">
      <button class="btn-back" @click="router.push('/')">← Back</button>
      <h1>{{ stepTitles[step] }}</h1>
    </header>

    <main class="step-content">
      <!-- Step 0: Capture Image -->
      <div v-show="step === 0" class="step-panel">
        <div class="form-group">
          <label>Photo</label>
          <button class="btn-capture" @click="($refs.fileInput as HTMLInputElement)?.click()">
            Select or Capture Photo
          </button>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            @change="onFileSelected"
          />
          <img
            v-if="imagePreview"
            :src="imagePreview"
            alt="Preview"
            class="image-preview"
          />
        </div>
      </div>

      <!-- Step 1: Mask Drawing -->
      <div v-show="step === 1" class="step-panel step-mask">
        <p class="step-hint">Paint the area you want to change (shown in red)</p>
        <div ref="canvasWrapperRef" class="canvas-wrapper">
          <canvas
            ref="mainCanvasRef"
            :width="CANVAS_SIZE"
            :height="CANVAS_SIZE"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
          ></canvas>
        </div>
        <button class="btn-clear-mask" @click="clearMask">Clear Mask</button>
      </div>

      <!-- Step 2: Prompt -->
      <div v-show="step === 2" class="step-panel">
        <div class="form-group">
          <label for="prompt-input">What should change in the red area?</label>
          <textarea
            id="prompt-input"
            data-testid="prompt"
            v-model="prompt"
            rows="4"
            placeholder="e.g. Replace with white marble countertops"
          ></textarea>
        </div>
      </div>

      <!-- Step 3: Processing -->
      <div v-show="step === 3" class="step-panel step-processing">
        <div class="processing-indicator">
          <div class="spinner"></div>
          <p>{{ submitting ? 'Creating your renovation...' : 'Redirecting...' }}</p>
        </div>
      </div>

      <!-- Step 4: Result -->
      <div v-show="step === 4" class="step-panel step-result">
        <div v-if="impressionCompleted && resultImageUrl" class="result-display">
          <img :src="resultImageUrl" alt="Result" class="result-image" />
        </div>
        <div v-else class="processing-indicator">
          <div class="spinner"></div>
          <p v-if="impressionStatus === 'failed'">Processing failed.</p>
          <p v-else>Processing your image...</p>
        </div>
      </div>

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </main>

    <!-- Step 0-2 controls -->
    <footer v-if="step < 3" class="step-controls">
      <button
        class="btn-prev"
        :disabled="step === 0"
        @click="goPrev"
      >
        Back
      </button>
      <button
        class="btn-next"
        :disabled="!canGoNext"
        @click="goNext"
      >
        {{ nextLabel }}
      </button>
    </footer>

    <!-- Step 4: Three-button bar -->
    <footer v-if="step === 4" class="three-button-bar">
      <button class="bar-btn" @click="handleTimeline">Renovation Details</button>
      <button class="bar-btn bar-btn-danger" @click="handleTrash">Trash</button>
      <button class="bar-btn" :disabled="!impressionCompleted" @click="handleNextChange">Next Change</button>
    </footer>
  </div>
</template>

<style scoped>
.new-renovation-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: #f8f9fa;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: #1a1a2e;
  color: #fff;
  flex-shrink: 0;
}

.page-header h1 {
  margin: 0;
  font-size: 1.25rem;
}

.btn-back {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.25rem 0.5rem;
}

.btn-back:hover {
  color: #fff;
}

.step-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem;
}

.step-panel {
  width: 100%;
  max-width: 600px;
}

.step-mask {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.step-hint {
  margin: 0 0 0.75rem;
  color: #666;
  font-size: 0.95rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #1a1a2e;
}

.form-group input[type="text"],
.form-group textarea {
  width: 100%;
  padding: 0.6rem 0.8rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  font-family: inherit;
  box-sizing: border-box;
}

.form-group input[type="text"]:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #0f3460;
  box-shadow: 0 0 0 2px rgba(15, 52, 96, 0.15);
}

.btn-capture {
  display: inline-block;
  background: #0f3460;
  color: #fff;
  padding: 0.7rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
}

.btn-capture:hover {
  background: #1a1a2e;
}

.image-preview {
  margin-top: 0.75rem;
  max-width: 100%;
  max-height: 300px;
  border-radius: 0.5rem;
  border: 1px solid #eee;
}

.canvas-wrapper {
  position: relative;
  width: 100%;
  max-width: 500px;
  aspect-ratio: 1 / 1;
  background: #000;
  touch-action: none;
  border: 1px solid #ccc;
  border-radius: 0.5rem;
  overflow: hidden;
}

.canvas-wrapper canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.btn-clear-mask {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 0.85rem;
  margin-top: 0.5rem;
  padding: 0.25rem 0.5rem;
}

.btn-clear-mask:hover {
  color: #333;
}

.step-processing,
.step-result {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.processing-indicator {
  text-align: center;
  color: #666;
}

.result-display {
  width: 100%;
}

.result-image {
  width: 100%;
  border-radius: 0.5rem;
  display: block;
}

.spinner {
  border: 4px solid #eee;
  border-top: 4px solid #0f3460;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-text {
  color: #c0392b;
  font-size: 0.9rem;
  margin-top: 1rem;
}

.step-controls {
  display: flex;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: #fff;
  border-top: 1px solid #eee;
  flex-shrink: 0;
}

.btn-prev,
.btn-next {
  flex: 1;
  padding: 0.75rem;
  border-radius: 0.75rem;
  border: none;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
}

.btn-prev {
  background: #e2e8f0;
  color: #475569;
}

.btn-next {
  background: #0f3460;
  color: #fff;
}

.btn-prev:hover:not(:disabled) {
  background: #cbd5e1;
}

.btn-next:hover:not(:disabled) {
  background: #1a1a2e;
}

.btn-prev:disabled,
.btn-next:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.three-button-bar {
  display: flex;
  gap: 0;
  flex-shrink: 0;
  border-top: 1px solid #eee;
}

.bar-btn {
  flex: 1;
  padding: 0.9rem 0.5rem;
  border: none;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  background: #0f3460;
  color: #fff;
  border-right: 1px solid rgba(255,255,255,0.15);
}

.bar-btn:last-child {
  border-right: none;
}

.bar-btn:hover:not(:disabled) {
  background: #1a1a2e;
}

.bar-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.bar-btn-danger {
  background: #c0392b;
}

.bar-btn-danger:hover:not(:disabled) {
  background: #962d22;
}
</style>
