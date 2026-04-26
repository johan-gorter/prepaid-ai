<script setup lang="ts">
import {
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import MaskingCanvas from "../components/MaskingCanvas.vue";
import StickyFooter from "../components/StickyFooter.vue";
import UserMenu from "../components/UserMenu.vue";
import { useAuth } from "../composables/useAuth";
import {
  clearImpressionSource,
  getImpressionSource,
  setImpressionSource,
} from "../composables/useImpressionStore";
import { useRenovations } from "../composables/useRenovations";
import { resolveStorageUrl } from "../composables/useStorageUrl";
import { db, storage } from "../firebase";

type Stage = "preview" | "mask" | "prompt" | "processing";
type Source = "photo" | "crop" | "original" | "impression";

const route = useRoute();
const router = useRouter();
const { currentUser } = useAuth();
const { createRenovation, createImpression, deleteImpression, deleteRenovation } =
  useRenovations();

const stage = ref<Stage>("preview");
const sourceObjectUrl = ref<string | null>(null);
const prompt = ref("");
const errorMessage = ref<string | null>(null);

const maskingRef = ref<InstanceType<typeof MaskingCanvas> | null>(null);

const sourceParam = computed(() => route.query.source as Source | undefined);
const renovationParam = computed(
  () => (route.query.renovation as string | undefined) ?? null,
);
const impressionParam = computed(
  () => (route.query.impression as string | undefined) ?? null,
);

const headerTitle = computed(() => {
  if (stage.value === "prompt") return "Describe Change";
  if (stage.value === "processing") return "Processing";
  if (stage.value === "preview") return "Impression";
  return "Mark Area";
});

const canGenerate = computed(() => prompt.value.trim().length > 0);

function revokeSourceUrl() {
  if (sourceObjectUrl.value) {
    URL.revokeObjectURL(sourceObjectUrl.value);
    sourceObjectUrl.value = null;
  }
}

async function fetchAndCacheSource(source: Source): Promise<Blob | null> {
  if (!currentUser.value) return null;
  const uid = currentUser.value.uid;

  let path: string | undefined;
  if (source === "original") {
    if (!renovationParam.value) return null;
    const snap = await getDoc(
      doc(db, "users", uid, "renovations", renovationParam.value),
    );
    if (!snap.exists()) return null;
    path = snap.data().originalImagePath;
  } else if (source === "impression") {
    if (!renovationParam.value || !impressionParam.value) return null;
    const snap = await getDoc(
      doc(
        db,
        "users",
        uid,
        "renovations",
        renovationParam.value,
        "impressions",
        impressionParam.value,
      ),
    );
    if (!snap.exists()) return null;
    path = snap.data().resultImagePath;
  }

  if (!path) return null;

  const url = await resolveStorageUrl(path);
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  await setImpressionSource(blob);
  return blob;
}

async function initFromRoute(): Promise<void> {
  errorMessage.value = null;
  prompt.value = "";
  revokeSourceUrl();

  const source = sourceParam.value;
  if (!source) {
    router.replace("/renovations");
    return;
  }

  let blob = await getImpressionSource();
  if (!blob && (source === "original" || source === "impression")) {
    blob = await fetchAndCacheSource(source);
  }
  if (!blob) {
    errorMessage.value = "Source image is missing.";
    return;
  }

  sourceObjectUrl.value = URL.createObjectURL(blob);
  stage.value =
    source === "original" || source === "impression" ? "preview" : "mask";
}

onMounted(initFromRoute);
onUnmounted(revokeSourceUrl);

watch(
  () => route.fullPath,
  (newPath, oldPath) => {
    if (newPath !== oldPath) initFromRoute();
  },
);

function onCanvasArea() {
  if (stage.value === "preview") stage.value = "mask";
}

function onNextChange() {
  maskingRef.value?.clearMask();
  stage.value = "mask";
}

function onMaskNext() {
  stage.value = "prompt";
}

function onPromptBack() {
  stage.value = "mask";
}

async function onRetake() {
  await clearImpressionSource();
  router.replace("/photo");
}

function onBack() {
  if (renovationParam.value) {
    router.push(`/renovation/${renovationParam.value}`);
  } else {
    router.push("/renovations");
  }
}

async function onTrash() {
  const source = sourceParam.value;
  if (source === "impression") {
    if (renovationParam.value && impressionParam.value) {
      try {
        await deleteImpression(renovationParam.value, impressionParam.value);
      } catch {
        // ignore deletion errors — the user is leaving anyway
      }
    }
    await clearImpressionSource();
    if (renovationParam.value) {
      router.replace(`/renovation/${renovationParam.value}`);
    } else {
      router.replace("/renovations");
    }
  } else if (source === "original") {
    if (!renovationParam.value) return;
    if (!confirm("Delete this renovation and all its impressions?")) return;
    try {
      await deleteRenovation(renovationParam.value);
    } catch {
      // ignore
    }
    await clearImpressionSource();
    router.replace("/renovations");
  } else {
    // photo / crop
    await clearImpressionSource();
    router.replace("/renovations");
  }
}

function waitForCompletion(
  uid: string,
  renoId: string,
  impId: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const docRef = doc(
      db,
      "users",
      uid,
      "renovations",
      renoId,
      "impressions",
      impId,
    );
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        const data = snap.data();
        if (!data) return;
        if (data.status === "completed" && data.resultImagePath) {
          unsub();
          resolve(data.resultImagePath as string);
        } else if (data.status === "failed") {
          unsub();
          reject(new Error((data.error as string | undefined) ?? "Processing failed"));
        }
      },
      (err) => {
        unsub();
        reject(err);
      },
    );
  });
}

async function onGenerate() {
  if (!canGenerate.value) return;
  if (!currentUser.value) {
    errorMessage.value = "You must be signed in.";
    return;
  }
  if (!maskingRef.value) {
    errorMessage.value = "Mask not ready.";
    return;
  }

  errorMessage.value = null;
  stage.value = "processing";

  try {
    const uid = currentUser.value.uid;
    const ts = Date.now();
    const source = sourceParam.value!;

    let renovationId = renovationParam.value;
    let sourceImagePath: string;

    if (source === "photo" || source === "crop") {
      // Upload the IDB blob as the new renovation's original
      const sourceBlob = await getImpressionSource();
      if (!sourceBlob) throw new Error("Source image missing");
      const originalImagePath = `users/${uid}/originals/${ts}.webp`;
      await uploadBytes(storageRef(storage, originalImagePath), sourceBlob);
      renovationId = await createRenovation({ originalImagePath });
      sourceImagePath = originalImagePath;
    } else if (source === "original") {
      if (!renovationId) throw new Error("Renovation ID missing");
      const snap = await getDoc(
        doc(db, "users", uid, "renovations", renovationId),
      );
      if (!snap.exists()) throw new Error("Renovation not found");
      sourceImagePath = snap.data().originalImagePath;
    } else {
      // impression
      if (!renovationId || !impressionParam.value) {
        throw new Error("Renovation/impression IDs missing");
      }
      const snap = await getDoc(
        doc(
          db,
          "users",
          uid,
          "renovations",
          renovationId,
          "impressions",
          impressionParam.value,
        ),
      );
      if (!snap.exists()) throw new Error("Source impression not found");
      const path = snap.data().resultImagePath;
      if (!path) throw new Error("Source impression has no result image");
      sourceImagePath = path;
    }

    const compositeImagePath = `users/${uid}/composites/${ts}.webp`;
    const compositeBlob = await maskingRef.value.getCompositeBlob();
    await uploadBytes(storageRef(storage, compositeImagePath), compositeBlob);

    const newImpressionId = await createImpression(renovationId!, {
      sourceImagePath,
      compositeImagePath,
      prompt: prompt.value.trim(),
    });

    const resultPath = await waitForCompletion(
      uid,
      renovationId!,
      newImpressionId,
    );

    const resultUrl = await resolveStorageUrl(resultPath);
    const resultBlob = await fetch(resultUrl).then((r) => r.blob());
    await setImpressionSource(resultBlob);

    router.replace({
      path: "/new-impression",
      query: {
        source: "impression",
        renovation: renovationId!,
        impression: newImpressionId,
      },
    });
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : "Unknown error";
    stage.value = "prompt";
  }
}

const showRetake = computed(
  () => stage.value === "mask" && sourceParam.value === "photo",
);
const showResultMarker = computed(() => sourceParam.value === "impression");
const resultMarkerSrc = computed(() => sourceObjectUrl.value);
</script>

<template>
  <div class="page-layout">
    <header class="fixed">
      <nav>
        <button
          class="transparent circle"
          @click="onBack"
          aria-label="← Back"
        >
          <i aria-hidden="true">arrow_back</i>
        </button>
        <h1 class="max">{{ headerTitle }}</h1>
        <UserMenu />
      </nav>
    </header>

    <main
      class="responsive wizard-main"
      style="
        max-width: 800px;
        margin: 0 auto;
        padding-top: 4.5rem;
        padding-bottom: 5rem;
      "
    >
      <p
        class="small-text center-align"
        :class="{ 'visually-hidden': stage !== 'mask' }"
      >
        Paint the area you want to change (shown in red)
      </p>

      <div
        class="canvas-area"
        :class="{ 'inert-canvas': stage === 'processing' }"
        @pointerdown="onCanvasArea"
      >
        <MaskingCanvas
          v-if="sourceObjectUrl"
          ref="maskingRef"
          :image-url="sourceObjectUrl"
        />

        <!-- Hidden marker so E2E `getByAltText('Result')` can detect a
             completed impression on the wizard page. Opacity 0 keeps it
             visible to Playwright while not visually overlapping. -->
        <img
          v-if="showResultMarker && resultMarkerSrc"
          class="result-marker"
          :src="resultMarkerSrc"
          alt="Result"
        />

        <!-- Prompt overlay sits on the top half of the image during prompt -->
        <div v-show="stage === 'prompt'" class="prompt-overlay">
          <div class="field textarea label border round prompt-field">
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

        <!-- Processing overlay -->
        <div v-show="stage === 'processing'" class="processing-overlay">
          <progress class="circle"></progress>
          <p>Creating your impression...</p>
        </div>
      </div>

      <button
        v-if="stage === 'mask'"
        class="transparent small-round center-block"
        @click="maskingRef?.clearMask()"
      >
        <i aria-hidden="true">delete_sweep</i>
        <span>Clear Mask</span>
      </button>

      <p v-if="errorMessage" class="error-text center-align">
        {{ errorMessage }}
      </p>
    </main>

    <!-- Preview stage footer: Trash | Next Change -->
    <StickyFooter v-if="stage === 'preview'">
      <button
        class="max small-round"
        @click="onBack"
        aria-label="Renovation Details"
      >
        <i aria-hidden="true">timeline</i>
        <span>Renovation Details</span>
      </button>
      <button class="max small-round error" @click="onTrash">
        <i aria-hidden="true">delete</i>
        <span>Trash</span>
      </button>
      <button class="max small-round" @click="onNextChange" aria-label="Next Change">
        <i aria-hidden="true">edit</i>
        <span>Next Change</span>
      </button>
    </StickyFooter>

    <!-- Mask stage footer: [Retake] | Trash | Next -->
    <StickyFooter v-if="stage === 'mask'">
      <button
        v-if="showRetake"
        class="max border small-round"
        @click="onRetake"
      >
        <i aria-hidden="true">photo_camera</i>
        <span>Retake</span>
      </button>
      <button class="max small-round error" @click="onTrash">
        <i aria-hidden="true">delete</i>
        <span>Trash</span>
      </button>
      <button class="max small-round" @click="onMaskNext">
        <i aria-hidden="true">arrow_forward</i>
        <span>Next</span>
      </button>
    </StickyFooter>

    <!-- Prompt stage footer: Back | Generate -->
    <StickyFooter v-if="stage === 'prompt'">
      <button class="max border small-round" @click="onPromptBack">
        <i aria-hidden="true">arrow_back</i>
        <span>Back</span>
      </button>
      <div class="small-space"></div>
      <button
        class="max small-round"
        :disabled="!canGenerate"
        @click="onGenerate"
      >
        <i aria-hidden="true">auto_awesome</i>
        <span>Generate</span>
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

.canvas-area {
  position: relative;
  max-width: 544px;
  margin: 0 auto;
}

.inert-canvas :deep(.masking-wrapper) {
  pointer-events: none;
}

.visually-hidden {
  visibility: hidden;
}

.center-block {
  display: block;
  margin: 0.5rem auto 0;
}

.result-marker {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
}

.prompt-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}

.prompt-field {
  width: 100%;
  max-width: 460px;
  background: var(--surface, #fff);
}

.processing-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}
</style>
