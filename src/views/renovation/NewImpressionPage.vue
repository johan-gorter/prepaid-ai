<script setup lang="ts">
import { doc, getDoc } from "firebase/firestore";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import AppBar from "../../components/AppBar.vue";
import FullscreenImageViewer from "../../components/FullscreenImageViewer.vue";
import MaskingCanvas from "../../components/MaskingCanvas.vue";
import { useAuth } from "../../composables/useAuth";
import { useGenerateImpression } from "../../composables/useGenerateImpression";
import { useImpressionDraft } from "../../composables/useImpressionDraft";
import {
  clearImpressionMask,
  clearImpressionSource,
  getImpressionDraft,
  getImpressionSource,
  setImpressionSource,
} from "../../composables/useImpressionStore";
import {
  deleteImpression,
  deleteRenovation,
} from "../../data/renovationRepo";
import { useShareHydration } from "../../composables/useShareHydration";
import { track } from "../../composables/useTrack";
import { resolveStorageUrl } from "../../composables/useStorageUrl";
import { db } from "../../firebase";
import ChooseActionStep from "./wizard/ChooseActionStep.vue";
import MaskStep from "./wizard/MaskStep.vue";
import PaintStep from "./wizard/PaintStep.vue";
import { DEFAULT_PAINT_COLOR } from "./wizard/paintPresets";
import PreviewStep from "./wizard/PreviewStep.vue";
import PromptStep from "./wizard/PromptStep.vue";
import type { Source, Stage } from "./wizard/wizardTypes";

// Hard-coded prompt for the "Verwijderen" (remove) action. Paired with a
// solid magenta composite so Gemini sees a clean "stain" and inpaints the
// area instead of trying to interpret a free-form user prompt.
const REMOVE_PROMPT =
  "remove the magenta stains. There a clear clean empty piece of the photo there.";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { currentUser } = useAuth();

const stage = ref<Stage>("preview");
const sourceObjectUrl = ref<string | null>(null);
const prompt = ref("");
const errorMessage = ref<string | null>(null);
const initialMask = ref<Blob | null>(null);
// True for the "Verwijderen" flow — switches the composite from a magenta
// checkerboard to a solid magenta fill. Persisted via the draft so the
// buy-credits / sign-in detour preserves the intent.
const useSolidMask = ref(false);
// Paint flow: true once the user has confirmed a colour in the paint dialog.
// Makes onGenerate write `mode: "paint"` + the chosen colour so the Cloud
// Function asks Gemini to repaint the checkerboard-marked area in that colour.
const usePaintMode = ref(false);
const paintColor = ref(DEFAULT_PAINT_COLOR);

const maskingRef = ref<InstanceType<typeof MaskingCanvas> | null>(null);

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

// Set when /share/:token can't be hydrated — drives the dedicated error
// screen so the recipient sees a polished message + Go home affordance rather
// than the half-broken preview shell.
const shareError = ref<string | null>(null);

const {
  restoredDraftKey,
  persistDraft,
  clearPersistedDraft,
  applyDraftIfMatching,
} = useImpressionDraft({
  prompt,
  sourceParam,
  renovationParam,
  impressionParam,
  useSolidMask,
  usePaintMode,
  paintColor,
  initialMask,
  maskingRef,
});

const { hydrateShare } = useShareHydration({
  sourceObjectUrl,
  shareError,
  stage,
});

const { canGenerate, onGenerate } = useGenerateImpression({
  currentUser,
  prompt,
  sourceParam,
  renovationParam,
  impressionParam,
  useSolidMask,
  usePaintMode,
  paintColor,
  stage,
  errorMessage,
  isMaskReady: () => !!maskingRef.value,
  getCompositeBlob: (variant) => maskingRef.value!.getCompositeBlob(variant),
  persistDraft,
  clearPersistedDraft,
});

const pageTitle = computed(() => {
  if (stage.value === "prompt") return t("newImpression.titleDescribe");
  if (stage.value === "processing") return t("newImpression.titleProcessing");
  if (stage.value === "preview") return t("newImpression.titleImpression");
  if (stage.value === "choose-action") return t("newImpression.titleChoose");
  if (stage.value === "paint") return t("newImpression.titlePaint");
  return t("newImpression.titleMark");
});

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
  shareError.value = null;
  prompt.value = "";
  initialMask.value = null;
  useSolidMask.value = false;
  usePaintMode.value = false;
  paintColor.value = DEFAULT_PAINT_COLOR;
  restoredDraftKey.value = null;
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
    if (!shareToken.value) {
      router.replace("/renovations");
      return;
    }
    await hydrateShare(shareToken.value);
    // A successful hydrate (no error screen) means an anonymous visitor landed
    // on a share link — the start of the viral loop's recipient side.
    if (!shareError.value) track("share_visit");
    return;
  }

  // Read source + draft in parallel, then assign sourceObjectUrl last so
  // MaskingCanvas mounts with the saved mask already in props. Setting the
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
    errorMessage.value = t("newImpression.sourceMissing");
    return;
  }

  // Restore prompt + mask drafts only when they match the current wizard
  // context; otherwise stale drafts from a different renovation could leak
  // across flows. Reads the persisted mask into `initialMask` before the
  // object URL is assigned, preserving the decode-vs-restore ordering.
  const matches = await applyDraftIfMatching(draft);

  sourceObjectUrl.value = URL.createObjectURL(blob);

  if (matches) {
    // Resume the paint step (with the chosen colour) after a buy-credits /
    // sign-in detour, rather than dropping into the free-prompt screen.
    if (usePaintMode.value) {
      stage.value = "paint";
    } else {
      stage.value = prompt.value || initialMask.value ? "prompt" : "mask";
    }
  } else {
    stage.value =
      source === "original" || source === "impression" ? "preview" : "mask";
    // A fresh photo/crop arrival landing on the mask stage means the visitor
    // has committed a photo — the funnel's photo_chosen step. The draft-match
    // branch above is a buy-credits/sign-in resume, not a new photo.
    if (source === "photo" || source === "crop") track("photo_chosen");
  }
}

onMounted(initFromRoute);
onUnmounted(revokeSourceUrl);

watch(
  () => route.fullPath,
  (newPath, oldPath) => {
    if (newPath !== oldPath) initFromRoute();
  },
);

// Fullscreen result viewer (#90). Opened from the expand icon or by pinching
// the inline result photo; the inline page itself never zooms.
const viewerOpen = ref(false);

// Tracks active pointers on the preview photo so we can tell a single-finger
// tap (the power-loop "edit on the result" gesture, viral-flow invariant #6)
// from a two-finger pinch (open the fullscreen viewer).
let previewPointerCount = 0;
let previewTapStartedMask = false;

function onCanvasPointerDown(e: PointerEvent) {
  if (stage.value !== "preview") return;
  // Right/middle mouse buttons must not trigger the power-loop tap-to-mask;
  // touch and pen always report button 0.
  if (e.button !== 0) return;
  previewPointerCount++;
  if (previewPointerCount === 1) {
    // First finger: keep the power loop — tapping the result starts a new
    // mask directly on the canvas.
    previewTapStartedMask = true;
    stage.value = "mask";
  } else if (previewPointerCount === 2) {
    // Second finger arrived → this is a pinch, not a paint. Undo the stage
    // switch + the stray first-finger stroke and hand off to the viewer.
    openResultViewer(true);
  }
}

function onCanvasPointerUp(e: PointerEvent) {
  // Mirror the down-guard so a right/middle button release can't desync the
  // pointer count (button > 0 on release of a non-primary button).
  if (e.button > 0) return;
  if (previewPointerCount > 0) previewPointerCount--;
  if (previewPointerCount === 0) previewTapStartedMask = false;
}

async function openResultViewer(fromPinch = false) {
  if (fromPinch && previewTapStartedMask) {
    // Cancel the accidental power-loop stroke the first finger began.
    maskingRef.value?.cancelDrawing();
    await clearMaskEverywhere();
    stage.value = "preview";
  }
  previewPointerCount = 0;
  previewTapStartedMask = false;
  viewerOpen.value = true;
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
  track("next_edit");
  await clearMaskEverywhere();
  useSolidMask.value = false;
  usePaintMode.value = false;
  prompt.value = "";
  stage.value = "mask";
}

function onMaskNext() {
  track("mask_done");
  stage.value = "choose-action";
}

function onChooseBack() {
  stage.value = "mask";
}

async function onChooseRemove() {
  track("action_chosen");
  prompt.value = REMOVE_PROMPT;
  useSolidMask.value = true;
  usePaintMode.value = false;
  await onGenerate();
}

function onChoosePaint() {
  track("action_chosen");
  stage.value = "paint";
}

function onPaintBack() {
  usePaintMode.value = false;
  stage.value = "choose-action";
}

async function onPaintGenerate() {
  usePaintMode.value = true;
  useSolidMask.value = false;
  // Non-empty prompt satisfies canGenerate and gives the timeline a label.
  prompt.value = t("newImpression.paintPrompt", { color: paintColor.value });
  await onGenerate();
}

function onChooseOther() {
  track("action_chosen");
  // Clear any leftover state from a previous Verwijderen / Schilder attempt so
  // the user gets the standard checkerboard + free-prompt flow.
  useSolidMask.value = false;
  usePaintMode.value = false;
  if (prompt.value === REMOVE_PROMPT) prompt.value = "";
  stage.value = "prompt";
}

function onPromptBack() {
  stage.value = "choose-action";
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
    // Trashing a generated result shortly after creating it is our
    // dissatisfaction proxy until a satisfaction meter exists (measurement.md).
    track("impression_trashed");
    if (currentUser.value && renovationParam.value && impressionParam.value) {
      try {
        await deleteImpression(
          currentUser.value.uid,
          renovationParam.value,
          impressionParam.value,
        );
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
    if (!currentUser.value || !renovationParam.value) return;
    if (!confirm(t("newImpression.deleteRenovationConfirm"))) return;
    try {
      await deleteRenovation(currentUser.value.uid, renovationParam.value);
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
// An owned renovation/timeline exists only for original/impression (which
// always carry a renovation param); photo/crop are fresh and share is a
// recipient, so neither has a timeline to return to.
const hasRenovation = computed(() => !!renovationParam.value);
const isShareSource = computed(() => sourceParam.value === "share");

// Mask stage (mutually exclusive): a fresh photo/crop shows Trash to discard
// the in-progress photo; an existing renovation shows Timeline to back out.
// Mid-mask we never offer Trash on an existing renovation (that would delete
// the parent impression/renovation), and a share recipient gets neither.
const showMaskTrash = computed(
  () => !hasRenovation.value && !isShareSource.value,
);
const showMaskTimeline = computed(() => hasRenovation.value);

// Preview stage (at rest on a saved item): both Trash (delete this
// impression/renovation — the dissatisfaction proxy) and Timeline (back to the
// timeline) are meaningful and non-redundant. A share recipient owns nothing,
// so both are hidden and the only forward action is "Another Change".
const showTrashButton = computed(() => !isShareSource.value);
const showTimelineButton = computed(() => !isShareSource.value);
// The expand-to-fullscreen affordance only makes sense once a result image is
// on screen — i.e. the preview stage with a loaded source.
const showFullscreenButton = computed(
  () => stage.value === "preview" && !!sourceObjectUrl.value,
);
</script>

<template>
  <div class="page-layout">
    <AppBar />

    <main
      class="responsive wizard-main"
      :class="{
        'wizard-main--prompt': stage === 'prompt',
        'wizard-main--paint': stage === 'paint',
      }"
    >
      <h5 v-if="!shareError" class="center-align no-margin wizard-title">
        {{ pageTitle }}
      </h5>

      <article
        v-if="shareError"
        class="border large-padding center-align share-error-card"
        data-testid="share-error"
      >
        <i class="extra" aria-hidden="true">link_off</i>
        <h5>{{ $t("newImpression.shareUnavailableTitle") }}</h5>
        <p>{{ shareError }}</p>
        <a class="button" href="/" data-testid="share-error-home">
          <i aria-hidden="true">home</i>
          <span>{{ $t("newImpression.goHome") }}</span>
        </a>
      </article>

      <div
        v-if="!shareError && stage !== 'choose-action' && stage !== 'paint'"
        class="step-hint"
      >
        <span v-if="stage === 'mask'">{{ $t("newImpression.paintHint") }}</span>
      </div>

      <div
        v-if="!shareError"
        class="canvas-area"
        :class="{
          'inert-canvas': stage === 'processing' || stage === 'choose-action',
          'canvas-area--collapsed': stage === 'prompt',
          'canvas-area--hidden': stage === 'paint',
        }"
        @pointerdown="onCanvasPointerDown"
        @pointerup="onCanvasPointerUp"
        @pointercancel="onCanvasPointerUp"
      >
        <MaskingCanvas
          v-if="sourceObjectUrl"
          ref="maskingRef"
          :image-url="sourceObjectUrl"
          :initial-mask="initialMask"
        />

        <!-- Expand-to-fullscreen affordance (#90): discoverable entry point
             for users who never think to pinch. Stops propagation so it never
             triggers the power-loop tap-to-mask underneath it. -->
        <button
          v-if="showFullscreenButton"
          type="button"
          class="fullscreen-open circle transparent"
          data-testid="fullscreen-open"
          :aria-label="$t('newImpression.fullscreenOpen')"
          @pointerdown.stop
          @click.stop="openResultViewer()"
        >
          <i aria-hidden="true">fullscreen</i>
        </button>

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
          <p>{{ $t("newImpression.creating") }}</p>
        </div>
      </div>

      <PromptStep
        v-if="stage === 'prompt'"
        v-model="prompt"
        :can-generate="canGenerate"
        @back="onPromptBack"
        @generate="onGenerate"
      />

      <ChooseActionStep
        v-if="stage === 'choose-action'"
        @remove="onChooseRemove"
        @paint="onChoosePaint"
        @other="onChooseOther"
        @back="onChooseBack"
      />

      <PaintStep
        v-if="stage === 'paint'"
        v-model="paintColor"
        @back="onPaintBack"
        @generate="onPaintGenerate"
      />

      <MaskStep
        v-if="stage === 'mask'"
        :show-retake="showRetake"
        :show-trash="showMaskTrash"
        :show-timeline="showMaskTimeline"
        @clear-mask="clearMaskEverywhere"
        @retake="onRetake"
        @trash="onTrash"
        @renovation-details="onBack"
        @next="onMaskNext"
      />

      <p v-if="errorMessage" class="error-text center-align">
        {{ errorMessage }}
      </p>
    </main>

    <PreviewStep
      v-if="stage === 'preview' && !shareError"
      :renovation-id="renovationParam"
      :impression-id="impressionParam"
      :show-timeline-button="showTimelineButton"
      :show-share-button="showShareButton"
      :show-trash-button="showTrashButton"
      @renovation-details="onBack"
      @trash="onTrash"
      @next-change="onNextChange"
      @error="errorMessage = $event"
    />

    <FullscreenImageViewer
      :open="viewerOpen"
      :src="sourceObjectUrl"
      :alt="$t('newImpression.fullscreenAlt')"
      :close-label="$t('newImpression.fullscreenClose')"
      @close="viewerOpen = false"
    />
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

/* Paint stage: grow the main column to the full viewport so PaintStep's custom
   picker can stretch its preview down to just above the fixed footer (#87). */
.wizard-main--paint {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
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

.wizard-title {
  padding: 0 1rem;
}

.step-hint {
  /* min-height (not a fixed height) so the instruction can grow without the
     canvas overlapping it. The #85 copy fits one line at 320px, but a longer
     translation or larger font must push the canvas down, never hide behind
     it. */
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem 1rem;
  font-size: 0.875rem;
  text-align: center;
}

.canvas-area--hidden {
  display: none;
}

/* Edge-to-edge photo on phones (viral-flow invariant #9): every pixel of
   canvas width helps finger precision when masking. Break the canvas out of
   the responsive container to the full viewport width and drop the rounded
   corners so it meets both screen edges. Desktop keeps the centred 544px max. */
@media (max-width: 599px) {
  .canvas-area {
    width: 100vw;
    max-width: 100vw;
    margin-left: 50%;
    transform: translateX(-50%);
  }

  .canvas-area :deep(.masking-wrapper) {
    max-width: 100%;
    border-radius: 0;
  }
}

.fullscreen-open {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 2;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
}

.result-marker {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
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
