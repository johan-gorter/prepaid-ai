<script setup lang="ts">
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { doc, getDoc } from "firebase/firestore";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useRenovations } from "../composables/useRenovations";
import { useImpressions } from "../composables/useImpressions";
import { resolveStorageUrl } from "../composables/useStorageUrl";
import { db, storage } from "../firebase";

const route = useRoute();
const router = useRouter();
const { createImpression, deleteImpression } = useRenovations();
const { currentUser } = useAuth();

const renovationId = computed(() => route.params.id as string);
const sourceParam = computed(() => (route.query.source as string) ?? "before");

// Step state: 0=Loading source, 1=Mask, 2=Prompt, 3=Processing, 4=Result
const step = ref(0);
const stepTitles = ["Loading...", "1. Mark Area", "2. Describe Change", "3. Processing", "4. Result"];

const prompt = ref("");
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
const loadedImage = ref<HTMLImageElement | null>(null);

// Created impression tracking
const createdImpressionId = ref<string | null>(null);
const resultImageUrl = ref<string | null>(null);

// Source image path for upload
let sourceImagePath = "";

// Use impressions watcher for result polling
const renovationIdRef = ref(renovationId.value);
watch(renovationId, (val) => { renovationIdRef.value = val; });
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

let resizeObserver: ResizeObserver | null = null;

const canGoNext = computed(() => {
  if (step.value === 1) return true;
  if (step.value === 2) return prompt.value.trim().length > 0;
  return false;
});

const nextLabel = computed(() => {
  if (step.value === 2) return "Generate";
  return "Next";
});

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

async function loadSourceImage() {
  if (!currentUser.value) return;
  const uid = currentUser.value.uid;

  try {
    let imagePath: string;

    if (sourceParam.value === "before") {
      // Load original image from renovation doc
      const renoDoc = await getDoc(
        doc(db, "users", uid, "renovations", renovationId.value),
      );
      if (!renoDoc.exists()) {
        errorMessage.value = "Renovation not found.";
        return;
      }
      imagePath = renoDoc.data().originalImagePath;
    } else {
      // Load result image from impression doc
      const impDoc = await getDoc(
        doc(
          db, "users", uid, "renovations", renovationId.value,
          "impressions", sourceParam.value,
        ),
      );
      if (!impDoc.exists()) {
        errorMessage.value = "Source impression not found.";
        return;
      }
      imagePath = impDoc.data().resultImagePath;
      if (!imagePath) {
        errorMessage.value = "Source impression has no result image.";
        return;
      }
    }

    sourceImagePath = imagePath;
    const url = await resolveStorageUrl(imagePath);

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load source image"));
      img.src = url;
    });

    loadedImage.value = img;
    initCanvases();
    step.value = 1;
    requestAnimationFrame(renderCanvas);
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : "Failed to load source image.";
  }
}

function initCanvases() {
  const img = loadedImage.value;
  if (!img) return;

  // Source is already 1000x1000, draw directly
  sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = CANVAS_SIZE;
  sourceCanvas.height = CANVAS_SIZE;
  const srcCtx = sourceCanvas.getContext("2d")!;
  srcCtx.fillStyle = "black";
  srcCtx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  srcCtx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);

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
  step.value++;
  if (step.value === 3) {
    handleSubmit();
  }
}

function goPrev() {
  if (step.value <= 1 || step.value >= 3) return;
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

async function handleSubmit() {
  if (!prompt.value.trim()) {
    errorMessage.value = "Please describe the change.";
    step.value = 2;
    return;
  }
  if (!currentUser.value) {
    errorMessage.value = "You must be signed in.";
    step.value = 1;
    return;
  }

  submitting.value = true;
  errorMessage.value = null;

  try {
    const uid = currentUser.value.uid;
    const timestamp = Date.now();

    const compositeImagePath = `users/${uid}/composites/${timestamp}.png`;
    const compositeBlob = await getCompositeBlob();
    await uploadBytes(storageRef(storage, compositeImagePath), compositeBlob);

    const impressionId = await createImpression(renovationId.value, {
      sourceImagePath,
      compositeImagePath,
      prompt: prompt.value.trim(),
    });

    createdImpressionId.value = impressionId;
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
  if (!createdImpressionId.value) return;
  try {
    await deleteImpression(renovationId.value, createdImpressionId.value);
  } catch {
    // Ignore deletion errors
  }
  createdImpressionId.value = null;
  resultImageUrl.value = null;
  prompt.value = "";
  step.value = 1;
  clearMask();
  requestAnimationFrame(renderCanvas);
}

function handleTimeline() {
  router.push(`/renovation/${renovationId.value}`);
}

function handleNextChange() {
  if (!createdImpressionId.value) return;
  router.push(`/renovation/${renovationId.value}/new?source=${createdImpressionId.value}`);
}

onMounted(() => {
  loadSourceImage();
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
  <div class="new-impression-page">
    <header class="page-header">
      <button class="btn-back" @click="router.push(`/renovation/${renovationId}`)">← Back</button>
      <h1>{{ stepTitles[step] }}</h1>
    </header>

    <main class="step-content">
      <!-- Step 0: Loading source image -->
      <div v-show="step === 0" class="step-panel step-processing">
        <div class="processing-indicator">
          <div class="spinner"></div>
          <p>Loading source image...</p>
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
          <p>{{ submitting ? 'Creating impression...' : 'Processing...' }}</p>
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

    <!-- Step 1-2 controls -->
    <footer v-if="step >= 1 && step <= 2" class="step-controls">
      <button
        class="btn-prev"
        :disabled="step === 1"
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
.new-impression-page {
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

.form-group textarea {
  width: 100%;
  padding: 0.6rem 0.8rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  font-family: inherit;
  box-sizing: border-box;
}

.form-group textarea:focus {
  outline: none;
  border-color: #0f3460;
  box-shadow: 0 0 0 2px rgba(15, 52, 96, 0.15);
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
