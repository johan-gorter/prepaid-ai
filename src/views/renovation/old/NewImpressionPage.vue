<script setup lang="ts">
import { doc, getDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import MaskingCanvas from "../../../components/MaskingCanvas.vue";
import StickyFooter from "../../../components/StickyFooter.vue";
import StorageImage from "../../../components/StorageImage.vue";
import UserMenu from "../../../components/UserMenu.vue";
import { useAuth } from "../../../composables/useAuth";
import { useImpressions } from "../../../composables/useImpressions";
import { useRenovations } from "../../../composables/useRenovations";
import { resolveStorageUrl } from "../../../composables/useStorageUrl";
import { db, storage } from "../../../firebase";

const route = useRoute();
const router = useRouter();
const { createImpression, deleteImpression } = useRenovations();
const { currentUser } = useAuth();

const renovationId = computed(() => route.params.id as string);
const sourceParam = computed(() => (route.query.source as string) ?? "before");

// Step state: 0=Loading source, 1=Mask, 2=Prompt, 3=Processing, 4=Result
const step = ref(0);
const stepTitles = [
  "Loading...",
  "1. Mark Area",
  "2. Describe Change",
  "3. Processing",
  "4. Result",
];

const prompt = ref("");
const submitting = ref(false);
const errorMessage = ref<string | null>(null);

// Created impression tracking
const createdImpressionId = ref<string | null>(null);
const resultImagePath = ref<string | null>(null);

// Source image path for upload
let sourceImagePath = "";

// Use impressions watcher for result polling
const renovationIdRef = ref(renovationId.value);
watch(renovationId, (val) => {
  renovationIdRef.value = val;
});
const { impressions } = useImpressions(renovationIdRef);

// Watch for impression completion — watch both the impressions list and the
// createdImpressionId ref. When the Cloud Function completes before the client
// sets createdImpressionId, the impressions watcher alone would miss it.
watch([impressions, createdImpressionId], ([items, impId]) => {
  if (!impId) return;
  const imp = items.find((i) => i.id === impId);
  if (imp && imp.status === "completed" && imp.resultImagePath) {
    resultImagePath.value = imp.resultImagePath;
  }
});

// MaskingCanvas component ref
const maskingRef = ref<InstanceType<typeof MaskingCanvas> | null>(null);
const sourceImageUrl = ref<string | null>(null);

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

const impressionError = computed(() => {
  if (!createdImpressionId.value) return null;
  const imp = impressions.value.find((i) => i.id === createdImpressionId.value);
  return imp?.error ?? null;
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
          db,
          "users",
          uid,
          "renovations",
          renovationId.value,
          "impressions",
          sourceParam.value,
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
    sourceImageUrl.value = url;
    step.value = 1;
  } catch (err: unknown) {
    errorMessage.value =
      err instanceof Error ? err.message : "Failed to load source image.";
  }
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

    const compositeImagePath = `users/${uid}/composites/${timestamp}.webp`;
    const compositeBlob = await maskingRef.value!.getCompositeBlob();
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
  resultImagePath.value = null;
  prompt.value = "";
  step.value = 1;
  maskingRef.value?.clearMask();
}

function handleTimeline() {
  router.push(`/renovation/${renovationId.value}`);
}

function handleNextChange() {
  if (!createdImpressionId.value) return;
  router.push(
    `/renovation/${renovationId.value}/new?source=${createdImpressionId.value}`,
  );
}

function resetState() {
  step.value = 0;
  prompt.value = "";
  submitting.value = false;
  errorMessage.value = null;
  sourceImageUrl.value = null;
  createdImpressionId.value = null;
  resultImagePath.value = null;
  sourceImagePath = "";
}

// Reload when source query param changes (e.g. "Next Change" button)
watch(sourceParam, () => {
  resetState();
  loadSourceImage();
});

onMounted(() => {
  loadSourceImage();
});
</script>

<template>
  <div class="page-layout">
    <header class="fixed">
      <nav>
        <button
          class="transparent circle"
          @click="router.push(`/renovation/${renovationId}`)"
          aria-label="← Back"
        >
          <i aria-hidden="true">arrow_back</i>
        </button>
        <h1 class="max">{{ stepTitles[step] }}</h1>
        <UserMenu />
      </nav>
    </header>

    <main
      class="responsive"
      style="
        max-width: 800px;
        margin: 0 auto;
        padding-top: 4.5rem;
        padding-bottom: 5rem;
      "
    >
      <!-- Step 0: Loading source image -->
      <div v-show="step === 0" class="center-align large-padding">
        <progress class="circle"></progress>
        <p>Loading source image...</p>
      </div>

      <!-- Step 1: Mask Drawing -->
      <div v-show="step === 1" class="center-align">
        <p class="small-text">
          Paint the area you want to change (shown in red)
        </p>
        <MaskingCanvas
          v-if="sourceImageUrl"
          ref="maskingRef"
          :image-url="sourceImageUrl"
        />
        <button
          class="transparent small-round"
          @click="maskingRef?.clearMask()"
        >
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
        <p>{{ submitting ? "Creating impression..." : "Processing..." }}</p>
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
          <progress
            v-if="impressionStatus !== 'failed'"
            class="circle"
          ></progress>
          <i
            v-else
            aria-hidden="true"
            class="error-text"
            style="font-size: 3rem"
            >error</i
          >
          <p v-if="impressionStatus === 'failed'" class="error-text">
            Processing failed.{{ impressionError ? ` ${impressionError}` : "" }}
          </p>
          <p v-else>Processing your image...</p>
        </div>
      </div>

      <p v-if="errorMessage" class="error-text center-align">
        {{ errorMessage }}
      </p>
    </main>

    <!-- Step 1-2 controls -->
    <StickyFooter v-if="step >= 1 && step <= 2">
      <button
        class="max border small-round"
        :disabled="step === 1"
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
    </StickyFooter>

    <!-- Step 4: Three-button bar -->
    <StickyFooter v-if="step === 4">
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
</style>
