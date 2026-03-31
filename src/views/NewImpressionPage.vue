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
const CANVAS_SIZE = 1024;

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
      const renoDoc = await getDoc(
        doc(db, "users", uid, "renovations", renovationId.value),
      );
      if (!renoDoc.exists()) {
        errorMessage.value = "Renovation not found.";
        return;
      }
      imagePath = renoDoc.data().originalImagePath;
    } else {
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

function resetState() {
  step.value = 0;
  prompt.value = "";
  submitting.value = false;
  errorMessage.value = null;
  loadedImage.value = null;
  createdImpressionId.value = null;
  resultImageUrl.value = null;
  sourceImagePath = "";
  maskCanvas = null;
  maskCtx = null;
  sourceCanvas = null;
  isDrawing = false;
}

// Reload when source query param changes (e.g. "Next Change" button)
watch(sourceParam, () => {
  resetState();
  loadSourceImage();
});

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
  <div class="page-layout">
    <header class="fixed primary">
      <nav>
        <button class="transparent circle" @click="router.push(`/renovation/${renovationId}`)">
          <i>arrow_back</i>
        </button>
        <h5 class="max">{{ stepTitles[step] }}</h5>
      </nav>
    </header>

    <main class="responsive" style="max-width: 600px; margin: 0 auto; padding-top: 4.5rem; padding-bottom: 5rem;">
      <!-- Step 0: Loading source image -->
      <div v-show="step === 0" class="center-align large-padding">
        <progress class="circle"></progress>
        <p>Loading source image...</p>
      </div>

      <!-- Step 1: Mask Drawing -->
      <div v-show="step === 1" class="center-align">
        <p class="small-text">Paint the area you want to change (shown in red)</p>
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
        <button class="transparent small-round" @click="clearMask">
          <i>delete_sweep</i>
          <span>Clear Mask</span>
        </button>
      </div>

      <!-- Step 2: Prompt -->
      <div v-show="step === 2">
        <div class="field textarea label border round">
          <textarea
            id="prompt-input"
            data-testid="prompt"
            v-model="prompt"
            rows="4"
            placeholder=" "
          ></textarea>
          <label for="prompt-input">What should change in the red area?</label>
        </div>
      </div>

      <!-- Step 3: Processing -->
      <div v-show="step === 3" class="center-align large-padding">
        <progress class="circle"></progress>
        <p>{{ submitting ? 'Creating impression...' : 'Processing...' }}</p>
      </div>

      <!-- Step 4: Result -->
      <div v-show="step === 4">
        <div v-if="impressionCompleted && resultImageUrl" class="center-align">
          <img :src="resultImageUrl" alt="Result" class="responsive round" />
        </div>
        <div v-else class="center-align large-padding">
          <progress class="circle"></progress>
          <p v-if="impressionStatus === 'failed'" class="error-text">Processing failed.</p>
          <p v-else>Processing your image...</p>
        </div>
      </div>

      <p v-if="errorMessage" class="error-text center-align">{{ errorMessage }}</p>
    </main>

    <!-- Step 1-2 controls -->
    <footer v-if="step >= 1 && step <= 2" class="fixed">
      <nav>
        <button
          class="max border small-round"
          :disabled="step === 1"
          @click="goPrev"
        >
          <i>arrow_back</i>
          <span>Back</span>
        </button>
        <div class="small-space"></div>
        <button
          class="max small-round"
          :disabled="!canGoNext"
          @click="goNext"
        >
          <i>{{ step === 2 ? 'auto_awesome' : 'arrow_forward' }}</i>
          <span>{{ nextLabel }}</span>
        </button>
      </nav>
    </footer>

    <!-- Step 4: Three-button bar -->
    <footer v-if="step === 4" class="fixed">
      <nav>
        <button class="max small-round" @click="handleTimeline">
          <i>timeline</i>
          <span>Details</span>
        </button>
        <button class="max small-round error" @click="handleTrash">
          <i>delete</i>
          <span>Trash</span>
        </button>
        <button class="max small-round" :disabled="!impressionCompleted" @click="handleNextChange">
          <i>edit</i>
          <span>Next</span>
        </button>
      </nav>
    </footer>
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
}

.canvas-wrapper canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
