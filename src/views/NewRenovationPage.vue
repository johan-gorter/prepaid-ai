<script setup lang="ts">
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { useRenovations } from "../composables/useRenovations";
import { storage } from "../firebase";

const router = useRouter();
const { createRenovation, createImpression } = useRenovations();
const { currentUser } = useAuth();

// Step state: 0=Image, 1=Mask, 2=Prompt, 3=Processing
const step = ref(0);
const stepTitles = ["1. Capture Image", "2. Mark Area", "3. Describe Change", "4. Processing"];

const title = ref("");
const prompt = ref("");
const selectedFile = ref<File | null>(null);
const imagePreview = ref<string | null>(null);
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
const loadedImage = ref<HTMLImageElement | null>(null);

// Mask canvas state
const canvasWrapperRef = ref<HTMLElement | null>(null);
const mainCanvasRef = ref<HTMLCanvasElement | null>(null);
let maskCanvas: HTMLCanvasElement | null = null;
let maskCtx: CanvasRenderingContext2D | null = null;
let isDrawing = false;
const brushSize = 30;
const CANVAS_SIZE = 1000;

// Resize observer for canvas
let resizeObserver: ResizeObserver | null = null;

const canGoNext = computed(() => {
  if (step.value === 0) return !!loadedImage.value && title.value.trim().length > 0;
  if (step.value === 1) return true;
  if (step.value === 2) return prompt.value.trim().length > 0;
  return false;
});

const nextLabel = computed(() => {
  if (step.value === 2) return "Generate";
  return "Next";
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

function initMaskCanvas() {
  maskCanvas = document.createElement("canvas");
  maskCanvas.width = CANVAS_SIZE;
  maskCanvas.height = CANVAS_SIZE;
  maskCtx = maskCanvas.getContext("2d");
  if (maskCtx) {
    maskCtx.fillStyle = "black";
    maskCtx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }
}

function renderCanvas() {
  const canvas = mainCanvasRef.value;
  const img = loadedImage.value;
  if (!canvas || !img || !maskCanvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  ctx.globalAlpha = 0.45;
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalAlpha = 1.0;
}

function clearMask() {
  if (!maskCtx) return;
  maskCtx.fillStyle = "black";
  maskCtx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
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
  maskCtx.fillStyle = "white";
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
    initMaskCanvas();
    requestAnimationFrame(renderCanvas);
  }
  if (step.value === 3) {
    handleSubmit();
  }
}

function goPrev() {
  if (step.value <= 0 || step.value === 3) return;
  step.value--;
  if (step.value === 1) {
    requestAnimationFrame(renderCanvas);
  }
}

function getMaskDataUrl(): string {
  if (!maskCanvas) return "";
  return maskCanvas.toDataURL("image/png");
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function handleSubmit() {
  if (!selectedFile.value || !title.value.trim() || !prompt.value.trim()) {
    errorMessage.value = "Please fill in all fields and select an image.";
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
    const imageRef = storageRef(storage, originalImagePath);

    await uploadBytes(imageRef, selectedFile.value);

    // Upload mask image
    const maskImagePath = `users/${uid}/masks/${timestamp}.png`;
    const maskRef = storageRef(storage, maskImagePath);
    const maskBlob = await dataUrlToBlob(getMaskDataUrl());
    await uploadBytes(maskRef, maskBlob);

    const renovationId = await createRenovation({
      title: title.value.trim(),
      originalImagePath,
    });

    await createImpression(renovationId, {
      sourceImagePath: originalImagePath,
      maskImagePath,
      prompt: prompt.value.trim(),
    });

    router.push(`/renovation/${renovationId}`);
  } catch (err: unknown) {
    errorMessage.value =
      err instanceof Error ? err.message : "An unknown error occurred.";
    step.value = 2;
  } finally {
    submitting.value = false;
  }
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
          <label for="title">Title</label>
          <input
            id="title"
            v-model="title"
            type="text"
            placeholder="e.g. Kitchen remodel"
          />
        </div>

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
        <p class="step-hint">Paint the area you want to change</p>
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
          <label for="prompt-input">What should change in the masked area?</label>
          <textarea
            id="prompt-input"
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

      <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </main>

    <footer class="step-controls">
      <button
        class="btn-prev"
        :disabled="step === 0 || step === 3"
        @click="goPrev"
      >
        Back
      </button>
      <button
        v-if="step < 3"
        class="btn-next"
        :disabled="!canGoNext"
        @click="goNext"
      >
        {{ nextLabel }}
      </button>
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

.step-processing {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.processing-indicator {
  text-align: center;
  color: #666;
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
</style>
