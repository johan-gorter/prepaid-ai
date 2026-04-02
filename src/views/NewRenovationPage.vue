<script setup lang="ts">
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import StorageImage from "../components/StorageImage.vue";
import UserMenu from "../components/UserMenu.vue";
import { useAuth } from "../composables/useAuth";
import { useImpressions } from "../composables/useImpressions";
import { useRenovations } from "../composables/useRenovations";
import { storage } from "../firebase";

const router = useRouter();
const route = useRoute();
const { createRenovation, createImpression, deleteImpression } =
  useRenovations();
const { currentUser } = useAuth();

// Step state: 0=Image, 1=Mask, 2=Prompt, 3=Processing, 4=Result
const step = ref(0);
const stepTitles = [
  "1. Capture Image",
  "2. Mark Area",
  "3. Describe Change",
  "4. Processing",
  "5. Result",
];

const prompt = ref("");
const selectedFile = ref<File | null>(null);
const imagePreview = ref<string | null>(null);
const submitting = ref(false);
const errorMessage = ref<string | null>(null);
const loadedImage = ref<HTMLImageElement | null>(null);

// Created renovation/impression tracking
const createdRenovationId = ref<string | null>(null);
const createdImpressionId = ref<string | null>(null);
const resultImagePath = ref<string | null>(null);

// Use impressions watcher for result polling
const renovationIdRef = ref("");
const { impressions } = useImpressions(renovationIdRef);

// Watch for impression completion
watch(impressions, (items) => {
  if (!createdImpressionId.value) return;
  const imp = items.find((i) => i.id === createdImpressionId.value);
  if (imp && imp.status === "completed" && imp.resultImagePath) {
    resultImagePath.value = imp.resultImagePath;
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
    return {
      sx: 0,
      sy: 0,
      sw: imgW,
      sh: imgH,
      dx: 0,
      dy: 0,
      dw: size,
      dh: size,
    };
  }

  if (aspect > 1) {
    const letterboxScale = size / imgW;
    const cropScale = size / imgH;
    const scale = letterboxScale + r * (cropScale - letterboxScale);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const sx = drawW > size ? (drawW - size) / 2 / scale : 0;
    const sy = drawH > size ? (drawH - size) / 2 / scale : 0;
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
    const sx = drawW > size ? (drawW - size) / 2 / scale : 0;
    const sy = drawH > size ? (drawH - size) / 2 / scale : 0;
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
  const fit = computeSquareFit(
    img.naturalWidth,
    img.naturalHeight,
    CANVAS_SIZE,
  );
  srcCtx.drawImage(
    img,
    fit.sx,
    fit.sy,
    fit.sw,
    fit.sh,
    fit.dx,
    fit.dy,
    fit.dw,
    fit.dh,
  );

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
      "image/webp",
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
      "image/webp",
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

    const originalImagePath = `users/${uid}/originals/${timestamp}.webp`;
    const originalBlob = await getOriginalBlob();
    await uploadBytes(storageRef(storage, originalImagePath), originalBlob);

    const compositeImagePath = `users/${uid}/composites/${timestamp}.webp`;
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
    await deleteImpression(
      createdRenovationId.value,
      createdImpressionId.value,
    );
  } catch {
    // Ignore deletion errors
  }
  // Reset to step 1 with same source image
  createdImpressionId.value = null;
  resultImagePath.value = null;
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
  router.push(
    `/renovation/${createdRenovationId.value}/new?source=${createdImpressionId.value}`,
  );
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    if (step.value === 1) renderCanvas();
  });
  const wrapper = canvasWrapperRef.value;
  if (wrapper) resizeObserver.observe(wrapper);

  // Load cropped image from crop page if available
  if (route.query.source === "cropped") {
    const dataUrl = sessionStorage.getItem("croppedImage");
    if (dataUrl) {
      sessionStorage.removeItem("croppedImage");
      imagePreview.value = dataUrl;
      const img = new Image();
      img.onload = () => {
        loadedImage.value = img;
        // The image is already cropped to 1024x1024, so create a fake file
        fetch(dataUrl)
          .then((res) => res.blob())
          .then((blob) => {
            selectedFile.value = new File([blob], "cropped.webp", {
              type: "image/webp",
            });
          });
      };
      img.src = dataUrl;
    }
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="page-layout">
    <header class="fixed primary">
      <nav>
        <button
          class="transparent circle"
          @click="router.push('/')"
          aria-label="← Back"
        >
          <i aria-hidden="true">arrow_back</i>
        </button>
        <h5 class="max">{{ stepTitles[step] }}</h5>
        <UserMenu />
      </nav>
    </header>

    <main
      class="responsive"
      style="
        max-width: 600px;
        margin: 0 auto;
        padding-top: 4.5rem;
        padding-bottom: 5rem;
      "
    >
      <!-- Step 0: Capture Image -->
      <div v-show="step === 0">
        <div class="field border label" style="margin-bottom: 1rem">
          <nav>
            <button @click="($refs.fileInput as HTMLInputElement)?.click()">
              <i aria-hidden="true">photo_camera</i>
              <span>Select or Capture Photo</span>
            </button>
          </nav>
        </div>
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
          class="responsive round"
          style="max-height: 300px"
        />
      </div>

      <!-- Step 1: Mask Drawing -->
      <div v-show="step === 1" class="center-align">
        <p class="small-text">
          Paint the area you want to change (shown in red)
        </p>
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
          <i aria-hidden="true">delete_sweep</i>
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
        <p>
          {{ submitting ? "Creating your renovation..." : "Redirecting..." }}
        </p>
      </div>

      <!-- Step 4: Result -->
      <div v-show="step === 4">
        <div v-if="impressionCompleted && resultImagePath" class="center-align">
          <StorageImage
            :path="resultImagePath"
            alt="Result"
            class="responsive round"
          />
        </div>
        <div v-else class="center-align large-padding">
          <progress class="circle"></progress>
          <p v-if="impressionStatus === 'failed'" class="error-text">
            Processing failed.
          </p>
          <p v-else>Processing your image...</p>
        </div>
      </div>

      <p v-if="errorMessage" class="error-text center-align">
        {{ errorMessage }}
      </p>
    </main>

    <!-- Step 0-2 controls -->
    <footer v-if="step < 3" class="fixed">
      <nav>
        <button
          class="max border small-round"
          :disabled="step === 0"
          @click="goPrev"
        >
          <i aria-hidden="true">arrow_back</i>
          <span>Back</span>
        </button>
        <div class="small-space"></div>
        <button class="max small-round" :disabled="!canGoNext" @click="goNext">
          <i aria-hidden="true">{{
            step === 2 ? "auto_awesome" : "arrow_forward"
          }}</i>
          <span>{{ nextLabel }}</span>
        </button>
      </nav>
    </footer>

    <!-- Step 4: Three-button bar -->
    <footer v-if="step === 4" class="fixed">
      <nav>
        <button
          class="max small-round"
          @click="handleTimeline"
          aria-label="Renovation Details"
        >
          <i aria-hidden="true">timeline</i>
          <span>Details</span>
        </button>
        <button class="max small-round error" @click="handleTrash">
          <i aria-hidden="true">delete</i>
          <span>Trash</span>
        </button>
        <button
          class="max small-round"
          :disabled="!impressionCompleted"
          @click="handleNextChange"
          aria-label="Next Change"
        >
          <i aria-hidden="true">edit</i>
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
