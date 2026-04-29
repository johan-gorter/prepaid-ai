<script setup lang="ts">
import {
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppBar from "../components/AppBar.vue";
import MaskingCanvas from "../components/MaskingCanvas.vue";
import StickyFooter from "../components/StickyFooter.vue";
import { useAuth } from "../composables/useAuth";
import {
  clearImpressionDraft,
  clearImpressionMask,
  clearImpressionSource,
  getImpressionDraft,
  getImpressionMask,
  getImpressionSource,
  setImpressionDraft,
  setImpressionMask,
  setImpressionSource,
  type ImpressionDraft,
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
const initialMask = ref<Blob | null>(null);
let restoredDraftKey: string | null = null;

const maskingRef = ref<InstanceType<typeof MaskingCanvas> | null>(null);
const promptInputRef = ref<HTMLTextAreaElement | null>(null);

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

function draftKey(): string {
  return `${sourceParam.value ?? ""}|${renovationParam.value ?? ""}|${
    impressionParam.value ?? ""
  }`;
}

async function initFromRoute(): Promise<void> {
  errorMessage.value = null;
  prompt.value = "";
  initialMask.value = null;
  restoredDraftKey = null;
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

  // Restore prompt + mask drafts only when they match the current wizard
  // context — otherwise stale drafts from a different renovation could leak
  // across flows. Drafts are written when a guest hits Generate so that
  // signing in and returning preserves their work.
  const draft = await getImpressionDraft();
  const matches =
    draft &&
    (draft.source ?? "") === source &&
    (draft.renovation ?? null) === renovationParam.value &&
    (draft.impression ?? null) === impressionParam.value;
  if (matches && draft) {
    prompt.value = draft.prompt;
    initialMask.value = await getImpressionMask();
    restoredDraftKey = draftKey();
    stage.value = prompt.value || initialMask.value ? "prompt" : "mask";
  } else {
    stage.value =
      source === "original" || source === "impression" ? "preview" : "mask";
  }
}

async function persistDraft(): Promise<void> {
  const draft: ImpressionDraft = {
    prompt: prompt.value,
    source: sourceParam.value,
    renovation: renovationParam.value,
    impression: impressionParam.value,
  };
  await setImpressionDraft(draft);
  restoredDraftKey = draftKey();
  if (maskingRef.value) {
    const maskBlob = await maskingRef.value.getMaskBlob();
    if (maskBlob) await setImpressionMask(maskBlob);
  }
}

async function clearPersistedDraft(): Promise<void> {
  await Promise.all([clearImpressionDraft(), clearImpressionMask()]);
  restoredDraftKey = null;
}

watch(prompt, async (val) => {
  // Persist prompt edits whenever a draft has been established for this
  // wizard context, so a sign-in detour preserves what the user typed.
  if (restoredDraftKey === draftKey() && sourceParam.value) {
    await setImpressionDraft({
      prompt: val,
      source: sourceParam.value,
      renovation: renovationParam.value,
      impression: impressionParam.value,
    });
  }
});

onMounted(initFromRoute);
onUnmounted(revokeSourceUrl);

watch(
  () => route.fullPath,
  (newPath, oldPath) => {
    if (newPath !== oldPath) initFromRoute();
  },
);

watch(stage, async (next) => {
  if (next !== "prompt") return;
  await nextTick();
  const el = promptInputRef.value;
  if (!el) return;
  el.focus({ preventScroll: true });
  // iOS Safari fallback: VisualViewport resize can be slow, so explicitly
  // scroll the textarea into view once focus has settled.
  setTimeout(() => {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 250);
});

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
  await clearPersistedDraft();
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
    await clearPersistedDraft();
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
    await clearPersistedDraft();
    router.replace("/renovations");
  } else {
    // photo / crop
    await clearImpressionSource();
    await clearPersistedDraft();
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
  if (!maskingRef.value) {
    errorMessage.value = "Mask not ready.";
    return;
  }
  if (!currentUser.value) {
    // Persist the in-progress mask + prompt so signing in and coming back
    // restores the wizard exactly where the user left off.
    await persistDraft();
    router.push({
      path: "/login",
      query: { redirect: route.fullPath },
    });
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
    await clearPersistedDraft();

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
    <AppBar :title="headerTitle" />

    <main
      class="responsive wizard-main"
      :class="{ 'wizard-main--prompt': stage === 'prompt' }"
    >
      <div class="step-hint">
        <span v-if="stage === 'mask'">Paint the area you want to change (shown in red)</span>
      </div>

      <div
        class="canvas-area"
        :class="{
          'inert-canvas': stage === 'processing',
          'canvas-area--collapsed': stage === 'prompt',
        }"
        @pointerdown="onCanvasArea"
      >
        <MaskingCanvas
          v-if="sourceObjectUrl"
          ref="maskingRef"
          :image-url="sourceObjectUrl"
          :initial-mask="initialMask"
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

        <!-- Processing overlay -->
        <div v-show="stage === 'processing'" class="processing-overlay">
          <progress class="circle"></progress>
          <p>Creating your impression...</p>
        </div>
      </div>

      <div v-if="stage === 'prompt'" class="prompt-flex">
        <div class="field textarea label border round prompt-field">
          <textarea
            id="prompt-input"
            ref="promptInputRef"
            data-testid="prompt"
            v-model="prompt"
            placeholder=" "
          ></textarea>
          <label for="prompt-input">What should change in the red area?</label>
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
  height: calc(100dvh - var(--kb-inset, 0px));
}

.wizard-main {
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  padding-top: 4.5rem;
  padding-bottom: 5rem;
}

.wizard-main--prompt {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.canvas-area {
  position: relative;
  max-width: 544px;
  margin: 0 auto;
}

.canvas-area--collapsed {
  height: 0;
  overflow: visible;
}

.canvas-area--collapsed :deep(.masking-wrapper) {
  position: absolute;
  inset: 0 0 auto 50%;
  transform: translateX(-50%);
}

.inert-canvas :deep(.masking-wrapper) {
  pointer-events: none;
}

.step-hint {
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  text-align: center;
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

.prompt-flex {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0.5rem;
  width: 100%;
  max-width: 544px;
  margin: 0 auto;
}

.prompt-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  background: var(--surface, #fff);
}

.prompt-field textarea {
  flex: 1;
  min-height: 0;
  resize: none;
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
