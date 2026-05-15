<script setup lang="ts">
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppBar from "../components/AppBar.vue";
import MaskingCanvas from "../components/MaskingCanvas.vue";
import ShareDialog from "../components/ShareDialog.vue";
import StickyFooter from "../components/StickyFooter.vue";
import { useAuth } from "../composables/useAuth";
import { useBalance } from "../composables/useBalance";
import { createOrGetShareToken, fetchShare } from "../composables/useShare";
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
import { IMPRESSION_CREDITS } from "../credits";
import { db, storage } from "../firebase";

type Stage = "preview" | "mask" | "prompt" | "processing";
type Source = "photo" | "crop" | "original" | "impression" | "share";

const route = useRoute();
const router = useRouter();
const { currentUser } = useAuth();
const { balance, waitForLoad: waitForBalance } = useBalance();
const {
  createRenovation,
  createImpression,
  deleteImpression,
  deleteRenovation,
} = useRenovations();

const stage = ref<Stage>("preview");
const sourceObjectUrl = ref<string | null>(null);
const prompt = ref("");
const errorMessage = ref<string | null>(null);
const initialMask = ref<Blob | null>(null);
let restoredDraftKey: string | null = null;
// Synchronous re-entry guard for onGenerate. Awaiting the balance load
// before flipping stage→"processing" otherwise allows two rapid clicks
// to both pass the guards, upload the same composite, and create two
// impression docs (and double-bill the user).
let generateInFlight = false;

const maskingRef = ref<InstanceType<typeof MaskingCanvas> | null>(null);
const promptInputRef = ref<HTMLTextAreaElement | null>(null);

const shareToken = computed(
  () => (route.params.token as string | undefined) ?? undefined,
);
const sourceParam = computed<Source | undefined>(() =>
  shareToken.value ? "share" : (route.query.source as Source | undefined),
);
const renovationParam = computed(
  () => (route.query.renovation as string | undefined) ?? null,
);
const impressionParam = computed(
  () => (route.query.impression as string | undefined) ?? null,
);

const shareDialogOpen = ref(false);
const shareUrl = ref("");
const sharePending = ref(false);
// Set when /share/:token can't be hydrated — drives the dedicated error
// screen so the recipient sees a polished message + Go home affordance
// rather than the half-broken preview shell.
const shareError = ref<string | null>(null);

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
  shareError.value = null;
  prompt.value = "";
  initialMask.value = null;
  restoredDraftKey = null;
  revokeSourceUrl();

  const source = sourceParam.value;
  if (!source) {
    router.replace("/renovations");
    return;
  }

  // /share/:token — fetch the public share doc, drop any stale impression
  // state from a previous device session, hydrate the source from the share
  // URL, and land on preview. The recipient can then Next Change → paint /
  // prompt / Generate like any other source.
  if (source === "share") {
    const token = shareToken.value;
    if (!token) {
      router.replace("/renovations");
      return;
    }
    const share = await fetchShare(token);
    if (!share) {
      shareError.value =
        "This share link is no longer available. The owner may have deleted the impression.";
      return;
    }
    await Promise.all([
      clearImpressionSource(),
      clearImpressionMask(),
      clearImpressionDraft(),
    ]);
    let blob: Blob;
    try {
      const res = await fetch(share.resultImageUrl);
      if (!res.ok) throw new Error(`status ${res.status}`);
      blob = await res.blob();
    } catch {
      shareError.value =
        "This shared image could not be loaded. The owner may have deleted it.";
      return;
    }
    await setImpressionSource(blob);
    sourceObjectUrl.value = URL.createObjectURL(blob);
    stage.value = "preview";
    return;
  }

  // Read source + draft + mask in parallel, then assign sourceObjectUrl last
  // so MaskingCanvas mounts with the saved mask already in props. Setting the
  // object URL first would race the canvas's image decode against the draft
  // IDB reads, dropping the saved mask if the decode finishes first.
  const [savedSource, draft] = await Promise.all([
    getImpressionSource(),
    getImpressionDraft(),
  ]);
  let blob = savedSource;
  if (!blob && (source === "original" || source === "impression")) {
    blob = await fetchAndCacheSource(source);
  }
  if (!blob) {
    errorMessage.value = "Source image is missing.";
    return;
  }

  // Restore prompt + mask drafts only when they match the current wizard
  // context — otherwise stale drafts from a different renovation could leak
  // across flows. Drafts are written when a guest hits Generate so that
  // signing in and returning preserves their work.
  const matches =
    draft &&
    (draft.source ?? "") === source &&
    (draft.renovation ?? null) === renovationParam.value &&
    (draft.impression ?? null) === impressionParam.value;
  if (matches && draft) {
    prompt.value = draft.prompt;
    initialMask.value = await getImpressionMask();
    restoredDraftKey = draftKey();
  }

  sourceObjectUrl.value = URL.createObjectURL(blob);

  if (matches && draft) {
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
  growPromptInput();
  el.focus();
  revealPromptInput();
});

function growPromptInput() {
  const el = promptInputRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function revealPromptInput() {
  const el = promptInputRef.value;
  if (!el) return;
  el.scrollIntoView({ block: "nearest" });
  // VisualViewport resize can land after focus on mobile, especially iOS.
  window.setTimeout(() => el.scrollIntoView({ block: "center" }), 250);
}

function onCanvasArea() {
  if (stage.value === "preview") stage.value = "mask";
}

async function clearMaskEverywhere() {
  // Drop the in-memory mask, the cached restore prop, and the persisted IDB
  // copy in lockstep. Without the IDB delete a sign-in detour would silently
  // resurrect the cleared mask on the next initFromRoute pass.
  maskingRef.value?.clearMask();
  initialMask.value = null;
  await clearImpressionMask();
}

async function onNextChange() {
  await clearMaskEverywhere();
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
          reject(
            new Error(
              (data.error as string | undefined) ?? "Processing failed",
            ),
          );
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
  // Synchronous guard — must come before any await so a double-click can't
  // get two invocations through to upload + createImpression.
  if (generateInFlight) return;
  if (!canGenerate.value) return;
  if (!maskingRef.value) {
    errorMessage.value = "Mask not ready.";
    return;
  }
  generateInFlight = true;
  try {
    // Make sure we know the user's actual balance before deciding whether
    // to redirect to /buy-credits — otherwise the initial Firestore snapshot
    // race would bounce a user with funds straight to the purchase page.
    if (currentUser.value) await waitForBalance();
    if (!currentUser.value || balance.value < IMPRESSION_CREDITS) {
      // Persist the in-progress mask + prompt so the buy-credits / sign-in
      // detour leaves the wizard exactly where the user left off.
      await persistDraft();
      router.push({
        path: "/buy-credits",
        query: {
          min: String(IMPRESSION_CREDITS),
          max: String(IMPRESSION_CREDITS),
          redirect: route.fullPath,
        },
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

      if (source === "photo" || source === "crop" || source === "share") {
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
  } finally {
    generateInFlight = false;
  }
}

const showRetake = computed(
  () => stage.value === "mask" && sourceParam.value === "photo",
);
const showResultMarker = computed(
  () => sourceParam.value === "impression" || sourceParam.value === "share",
);
const resultMarkerSrc = computed(() => sourceObjectUrl.value);
const showShareButton = computed(
  () =>
    sourceParam.value === "impression" &&
    !!renovationParam.value &&
    !!impressionParam.value,
);
const showTrashButton = computed(() => sourceParam.value !== "share");

async function onShare() {
  if (sharePending.value) return;
  if (!renovationParam.value || !impressionParam.value) return;
  sharePending.value = true;
  try {
    const token = await createOrGetShareToken(
      renovationParam.value,
      impressionParam.value,
    );
    shareUrl.value = `${location.origin}/share/${token}`;
    shareDialogOpen.value = true;
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : "Failed to create share link";
  } finally {
    sharePending.value = false;
  }
}
</script>

<template>
  <div class="page-layout">
    <AppBar :title="headerTitle" />

    <main
      class="responsive wizard-main"
      :class="{ 'wizard-main--prompt': stage === 'prompt' }"
    >
      <article
        v-if="shareError"
        class="border round large-padding center-align share-error-card"
        data-testid="share-error"
      >
        <i class="extra" aria-hidden="true">link_off</i>
        <h5>Share unavailable</h5>
        <p>{{ shareError }}</p>
        <a class="button" href="/" data-testid="share-error-home">
          <i aria-hidden="true">home</i>
          <span>Go to home</span>
        </a>
      </article>

      <div v-if="!shareError" class="step-hint">
        <span v-if="stage === 'mask'"
          >Paint the area you want to change (shown in red)</span
        >
      </div>

      <div
        v-if="!shareError"
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
            @focus="revealPromptInput"
            @input="growPromptInput"
          ></textarea>
          <label for="prompt-input">What should change in the red area?</label>
        </div>
      </div>

      <button
        v-if="stage === 'mask'"
        class="transparent small-round center-block"
        @click="clearMaskEverywhere"
      >
        <i aria-hidden="true">delete_sweep</i>
        <span>Clear Mask</span>
      </button>

      <p v-if="errorMessage" class="error-text center-align">
        {{ errorMessage }}
      </p>
    </main>

    <!-- Preview stage footer: Trash | Next Change -->
    <StickyFooter v-if="stage === 'preview' && !shareError">
      <button
        class="max small-round"
        @click="onBack"
        aria-label="Renovation Details"
      >
        <i aria-hidden="true">timeline</i>
        <span>Renovation Details</span>
      </button>
      <button
        v-if="showShareButton"
        class="max small-round"
        :disabled="sharePending"
        data-testid="share-button"
        @click="onShare"
        aria-label="Share"
      >
        <i aria-hidden="true">share</i>
        <span>Share</span>
      </button>
      <button
        v-if="showTrashButton"
        class="max small-round error"
        @click="onTrash"
      >
        <i aria-hidden="true">delete</i>
        <span>Trash</span>
      </button>
      <button
        class="max small-round"
        @click="onNextChange"
        aria-label="Next Change"
      >
        <i aria-hidden="true">edit</i>
        <span>Next Change</span>
      </button>
    </StickyFooter>

    <ShareDialog
      :open="shareDialogOpen"
      :url="shareUrl"
      @close="shareDialogOpen = false"
    />

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
  min-height: 100dvh;
}

.wizard-main {
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  padding-top: var(--app-bar-clearance);
  padding-bottom: 5rem;
}

.share-error-card {
  max-width: 480px;
  margin: 2rem auto;
}

.share-error-card h5 {
  margin: 0.5rem 0;
}

.wizard-main--prompt {
  min-height: 100dvh;
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
  padding: 0.5rem;
  width: 100%;
  max-width: 544px;
  margin: 0 auto;
  scroll-margin-bottom: calc(var(--kb-inset, 0px) + 6rem);
}

.prompt-field {
  width: 100%;
  background: var(--surface, #fff);
}

.prompt-field textarea {
  min-height: clamp(
    14rem,
    calc(100dvh - var(--app-bar-clearance) - 12rem),
    28rem
  );
  overflow-y: hidden;
  resize: none;
  scroll-margin-bottom: calc(var(--kb-inset, 0px) + 6rem);
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
