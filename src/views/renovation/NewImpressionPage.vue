<script setup lang="ts">
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import AppBar from "../../components/AppBar.vue";
import MaskingCanvas from "../../components/MaskingCanvas.vue";
import ShareDialog from "../../components/ShareDialog.vue";
import StickyFooter from "../../components/StickyFooter.vue";
import { useAuth } from "../../composables/useAuth";
import { useBalance } from "../../composables/useBalance";
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
} from "../../composables/useImpressionStore";
import { useRenovations } from "../../composables/useRenovations";
import { createOrGetShareToken, fetchShare } from "../../composables/useShare";
import { resolveStorageUrl } from "../../composables/useStorageUrl";
import { IMPRESSION_CREDITS } from "../../credits";
import { db, storage } from "../../firebase";

type Stage =
  | "preview"
  | "mask"
  | "choose-action"
  | "paint"
  | "prompt"
  | "processing";
type Source = "photo" | "crop" | "original" | "impression" | "share";

// Hard-coded prompt for the "Verwijderen" (remove) action. Paired with a
// solid magenta composite so Gemini sees a clean "stain" and inpaints the
// area instead of trying to interpret a free-form user prompt.
const REMOVE_PROMPT =
  "remove the magenta stains. There a clear clean empty piece of the photo there.";

// Curated RAL swatches offered in the paint dialog (4 light + 4 dark),
// plus a free colour picker. Values are the standard RAL approximations.
const PAINT_PRESETS: { name: string; hex: string }[] = [
  { name: "RAL 9010", hex: "#F4F4F0" },
  { name: "RAL 9001", hex: "#EAE6CA" },
  { name: "RAL 1013", hex: "#E3D9C6" },
  { name: "RAL 7035", hex: "#C5C7C4" },
  { name: "RAL 7016", hex: "#383E42" },
  { name: "RAL 9005", hex: "#0A0A0A" },
  { name: "RAL 5004", hex: "#18171C" },
  { name: "RAL 6009", hex: "#213529" },
];
const DEFAULT_PAINT_COLOR = PAINT_PRESETS[0]!.hex;

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
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
// True for the "Verwijderen" flow — switches the composite from a magenta
// checkerboard to a solid magenta fill. Persisted via the draft so the
// buy-credits / sign-in detour preserves the intent.
const useSolidMask = ref(false);
// Paint flow: true once the user has confirmed a colour in the paint dialog.
// Makes onGenerate write `mode: "paint"` + the chosen colour so the Cloud
// Function asks Gemini to repaint the checkerboard-marked area in that
// colour.
const usePaintMode = ref(false);
const paintColor = ref(DEFAULT_PAINT_COLOR);
const paintTab = ref<"standard" | "custom">("standard");
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

const pageTitle = computed(() => {
  if (stage.value === "prompt") return t("newImpression.titleDescribe");
  if (stage.value === "processing") return t("newImpression.titleProcessing");
  if (stage.value === "preview") return t("newImpression.titleImpression");
  if (stage.value === "choose-action") return t("newImpression.titleChoose");
  if (stage.value === "paint") return t("newImpression.titlePaint");
  return t("newImpression.titleMark");
});

const removeCostLabel = computed(() =>
  t("newImpression.chooseRemoveCost", { credits: IMPRESSION_CREDITS }),
);

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
  useSolidMask.value = false;
  usePaintMode.value = false;
  paintColor.value = DEFAULT_PAINT_COLOR;
  paintTab.value = "standard";
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
      shareError.value = t("newImpression.shareLinkUnavailable");
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
      shareError.value = t("newImpression.shareImageUnavailable");
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
    errorMessage.value = t("newImpression.sourceMissing");
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
    useSolidMask.value = draft.solidMask === true;
    if (draft.paintColor) {
      usePaintMode.value = true;
      paintColor.value = draft.paintColor;
    }
    initialMask.value = await getImpressionMask();
    restoredDraftKey = draftKey();
  }

  sourceObjectUrl.value = URL.createObjectURL(blob);

  if (matches && draft) {
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
  }
}

async function persistDraft(): Promise<void> {
  const draft: ImpressionDraft = {
    prompt: prompt.value,
    source: sourceParam.value,
    renovation: renovationParam.value,
    impression: impressionParam.value,
    solidMask: useSolidMask.value,
    paintColor: usePaintMode.value ? paintColor.value : undefined,
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
  useSolidMask.value = false;
  usePaintMode.value = false;
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
      solidMask: useSolidMask.value,
      paintColor: usePaintMode.value ? paintColor.value : undefined,
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
  useSolidMask.value = false;
  usePaintMode.value = false;
  prompt.value = "";
  stage.value = "mask";
}

function onMaskNext() {
  stage.value = "choose-action";
}

function onChooseBack() {
  stage.value = "mask";
}

async function onChooseRemove() {
  prompt.value = REMOVE_PROMPT;
  useSolidMask.value = true;
  usePaintMode.value = false;
  await onGenerate();
}

function onChoosePaint() {
  paintTab.value = "standard";
  stage.value = "paint";
}

function selectPaintColor(hex: string) {
  paintColor.value = hex;
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
    if (!confirm(t("newImpression.deleteRenovationConfirm"))) return;
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

/**
 * Safety ceiling for the Cloud Function round-trip. If the function never
 * reports back (crashed, not deployed, emulator down), fail the wait so the
 * user gets an error and their retry buttons back instead of an eternal
 * processing spinner. Generations normally finish well within this.
 */
const COMPLETION_TIMEOUT_MS = 90_000;

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
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(t("newImpression.processingTimeout")));
    }, COMPLETION_TIMEOUT_MS);
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        const data = snap.data();
        if (!data) return;
        if (data.status === "completed" && data.resultImagePath) {
          clearTimeout(timer);
          unsub();
          resolve(data.resultImagePath as string);
        } else if (data.status === "failed") {
          clearTimeout(timer);
          unsub();
          reject(
            new Error(
              (data.error as string | undefined) ??
                t("newImpression.processingFailed"),
            ),
          );
        }
      },
      (err) => {
        clearTimeout(timer);
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
    errorMessage.value = t("newImpression.maskNotReady");
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
      // Paint and the free-prompt flow mark the masked area with the magenta
      // checkerboard (50% coverage forces a full repaint while the geometry
      // stays readable between the squares); remove hides it under solid
      // magenta.
      const compositeBlob = await maskingRef.value.getCompositeBlob(
        useSolidMask.value ? "solid" : "checker",
      );
      await uploadBytes(storageRef(storage, compositeImagePath), compositeBlob);

      const newImpressionId = await createImpression(renovationId!, {
        sourceImagePath,
        compositeImagePath,
        prompt: prompt.value.trim(),
        ...(usePaintMode.value
          ? { paintColor: paintColor.value, mode: "paint" }
          : {}),
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
      errorMessage.value =
        err instanceof Error ? err.message : t("newImpression.unknownError");
      // The Verwijderen and Schilder flows skip the free-prompt screen, so on
      // failure fall back to their own step instead: paint returns to the
      // colour picker (keeping the selection), remove to choose-action.
      stage.value = usePaintMode.value
        ? "paint"
        : useSolidMask.value
          ? "choose-action"
          : "prompt";
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
      err instanceof Error ? err.message : t("newImpression.failedShareLink");
  } finally {
    sharePending.value = false;
  }
}
</script>

<template>
  <div class="page-layout">
    <AppBar />

    <main
      class="responsive wizard-main"
      :class="{ 'wizard-main--prompt': stage === 'prompt' }"
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
          'inert-canvas': stage === 'processing',
          'canvas-area--collapsed': stage === 'prompt',
          'canvas-area--hidden': stage === 'choose-action' || stage === 'paint',
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
          <p>{{ $t("newImpression.creating") }}</p>
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
          <label for="prompt-input">{{ $t("newImpression.promptLabel") }}</label>
        </div>
      </div>

      <div
        v-if="stage === 'choose-action'"
        class="choose-action-grid"
        data-testid="choose-action"
      >
        <button
          class="small-round choose-action-button"
          data-testid="choose-remove"
          @click="onChooseRemove"
        >
          <i aria-hidden="true">delete_sweep</i>
          <span>{{ $t("newImpression.chooseRemove") }}</span>
          <span class="choose-action-cost">{{ removeCostLabel }}</span>
        </button>
        <button
          class="small-round choose-action-button"
          data-testid="choose-paint"
          @click="onChoosePaint"
        >
          <i aria-hidden="true">format_paint</i>
          <span>{{ $t("newImpression.choosePaint") }}</span>
        </button>
        <button
          class="small-round choose-action-button"
          data-testid="choose-other"
          @click="onChooseOther"
        >
          <i aria-hidden="true">tune</i>
          <span>{{ $t("newImpression.chooseOther") }}</span>
        </button>
      </div>

      <div v-if="stage === 'paint'" class="paint-step" data-testid="paint-step">
        <div class="tabs">
          <a
            :class="{ active: paintTab === 'standard' }"
            data-testid="paint-tab-standard"
            @click="paintTab = 'standard'"
          >
            <i aria-hidden="true">palette</i>
            <span>{{ $t("newImpression.paintTabStandard") }}</span>
          </a>
          <a
            :class="{ active: paintTab === 'custom' }"
            data-testid="paint-tab-custom"
            @click="paintTab = 'custom'"
          >
            <i aria-hidden="true">colorize</i>
            <span>{{ $t("newImpression.paintTabCustom") }}</span>
          </a>
        </div>

        <div
          v-if="paintTab === 'standard'"
          class="paint-swatch-grid"
          data-testid="paint-standard"
        >
          <button
            v-for="preset in PAINT_PRESETS"
            :key="preset.hex"
            type="button"
            class="paint-swatch"
            :class="{ 'paint-swatch--active': paintColor === preset.hex }"
            :style="{ backgroundColor: preset.hex }"
            :title="preset.name"
            :aria-label="preset.name"
            :aria-pressed="paintColor === preset.hex"
            :data-testid="`paint-swatch-${preset.hex}`"
            @click="selectPaintColor(preset.hex)"
          ></button>
        </div>

        <div
          v-else
          class="paint-custom"
          data-testid="paint-custom"
        >
          <input
            type="color"
            v-model="paintColor"
            class="paint-color-input"
            data-testid="paint-color"
            :aria-label="$t('newImpression.paintColorLabel')"
          />
          <span class="paint-hex">{{ paintColor.toUpperCase() }}</span>
        </div>
      </div>

      <button
        v-if="stage === 'mask'"
        class="transparent small-round center-block"
        @click="clearMaskEverywhere"
      >
        <i aria-hidden="true">delete_sweep</i>
        <span>{{ $t("newImpression.clearMask") }}</span>
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
        :aria-label="$t('newImpression.renovationDetails')"
      >
        <i aria-hidden="true">timeline</i>
        <span>{{ $t("newImpression.renovationDetails") }}</span>
      </button>
      <button
        v-if="showShareButton"
        class="max small-round"
        :disabled="sharePending"
        data-testid="share-button"
        @click="onShare"
        :aria-label="$t('newImpression.share')"
      >
        <i aria-hidden="true">share</i>
        <span>{{ $t("newImpression.share") }}</span>
      </button>
      <button
        v-if="showTrashButton"
        class="max small-round error"
        @click="onTrash"
      >
        <i aria-hidden="true">delete</i>
        <span>{{ $t("newImpression.trash") }}</span>
      </button>
      <button
        class="max small-round"
        @click="onNextChange"
        :aria-label="$t('newImpression.nextChange')"
      >
        <i aria-hidden="true">edit</i>
        <span>{{ $t("newImpression.nextChange") }}</span>
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
        <span>{{ $t("newImpression.retake") }}</span>
      </button>
      <button class="max small-round error" @click="onTrash">
        <i aria-hidden="true">delete</i>
        <span>{{ $t("newImpression.trash") }}</span>
      </button>
      <button class="max small-round" @click="onMaskNext">
        <i aria-hidden="true">arrow_forward</i>
        <span>{{ $t("newImpression.next") }}</span>
      </button>
    </StickyFooter>

    <!-- Choose-action stage footer: Back -->
    <StickyFooter v-if="stage === 'choose-action'">
      <button class="max border small-round" @click="onChooseBack">
        <i aria-hidden="true">arrow_back</i>
        <span>{{ $t("newImpression.back") }}</span>
      </button>
    </StickyFooter>

    <!-- Paint stage footer: Back | Generate -->
    <StickyFooter v-if="stage === 'paint'">
      <button class="max border small-round" @click="onPaintBack">
        <i aria-hidden="true">arrow_back</i>
        <span>{{ $t("newImpression.back") }}</span>
      </button>
      <div class="small-space"></div>
      <button
        class="max small-round"
        data-testid="paint-generate"
        @click="onPaintGenerate"
      >
        <i aria-hidden="true">auto_awesome</i>
        <span>{{ $t("newImpression.generate") }}</span>
      </button>
    </StickyFooter>

    <!-- Prompt stage footer: Back | Generate -->
    <StickyFooter v-if="stage === 'prompt'">
      <button class="max border small-round" @click="onPromptBack">
        <i aria-hidden="true">arrow_back</i>
        <span>{{ $t("newImpression.back") }}</span>
      </button>
      <div class="small-space"></div>
      <button
        class="max small-round"
        :disabled="!canGenerate"
        @click="onGenerate"
      >
        <i aria-hidden="true">auto_awesome</i>
        <span>{{ $t("newImpression.generate") }}</span>
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

.wizard-title {
  padding: 0 1rem;
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

.choose-action-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 544px;
  margin: 1rem auto 0;
  padding: 0 1rem;
  box-sizing: border-box;
}

/* Beer CSS buttons default to `box-sizing: content-box`, so `width: 100%` +
   padding overflows the parent on narrow viewports. Force border-box here so
   the buttons fit within the grid's content area on mobile. */
.choose-action-button {
  width: 100%;
  padding: 1rem;
  justify-content: center;
  box-sizing: border-box;
  min-width: 0;
}

.choose-action-cost {
  margin-left: 0.5rem;
  font-weight: 600;
  opacity: 0.9;
}

.canvas-area--hidden {
  display: none;
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

.paint-step {
  max-width: 544px;
  margin: 1rem auto 0;
  padding: 0 1rem;
  box-sizing: border-box;
}

.paint-step .tabs {
  margin-bottom: 1rem;
}

.paint-swatch-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.paint-swatch {
  aspect-ratio: 1;
  width: 100%;
  padding: 0;
  border: 2px solid var(--outline, rgba(0, 0, 0, 0.2));
  border-radius: 0.5rem;
  cursor: pointer;
}

.paint-swatch--active {
  border-color: var(--primary, #6750a4);
  box-shadow: 0 0 0 2px var(--primary, #6750a4);
}

.paint-custom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 0;
}

.paint-color-input {
  width: 100%;
  max-width: 240px;
  height: 8rem;
  padding: 0;
  border: 1px solid var(--outline, rgba(0, 0, 0, 0.2));
  border-radius: 0.75rem;
  background: none;
  cursor: pointer;
}

.paint-hex {
  font-family: monospace;
  font-size: 1.1rem;
}
</style>
