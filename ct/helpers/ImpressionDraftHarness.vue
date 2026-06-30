<script setup lang="ts">
/**
 * Browser-side harness driving `useImpressionDraft` for component tests.
 *
 * CT test bodies run in Node (no IndexedDB), so the composable — which depends
 * on the IDB-backed impression store — is exercised here inside a mounted
 * component. Each action button runs a sequence then mirrors the resulting
 * ref + IndexedDB state into the DOM for the test to assert on.
 */
import { computed, onMounted, ref } from "vue";
import { useImpressionDraft } from "../../src/composables/useImpressionDraft";
import {
  clearImpressionDraft,
  clearImpressionMask,
  getImpressionDraft,
  getImpressionMask,
  setImpressionMask,
} from "../../src/composables/useImpressionStore";
import type { Source } from "../../src/views/renovation/wizard/wizardTypes";
import type { ReferenceKind } from "../../src/data/referenceImageRepo";

const prompt = ref("");
const sourceParam = computed<Source | undefined>(() => "photo");
const renovationParam = computed<string | null>(() => null);
const impressionParam = computed<string | null>(() => null);
const useSolidMask = ref(false);
const usePaintMode = ref(false);
const paintColor = ref("#F4F4F0");
const referenceKind = ref<ReferenceKind | null>(null);
const referencePath = ref<string | null>(null);
const initialMask = ref<Blob | null>(null);
const maskingRef = ref<{ getMaskBlob: () => Promise<Blob | null> } | null>({
  getMaskBlob: async () => new Blob(["mask"], { type: "image/webp" }),
});

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
  referenceKind,
  referencePath,
  initialMask,
  maskingRef,
});

const idbPrompt = ref("");
const idbPaint = ref("");
const idbHasMask = ref(false);
const idbDraftNull = ref(false);
const matchResult = ref("");

async function refreshIdb() {
  const d = await getImpressionDraft();
  idbDraftNull.value = d === null;
  idbPrompt.value = d?.prompt ?? "";
  idbPaint.value = d?.paintColor ?? "";
  idbHasMask.value = (await getImpressionMask()) !== null;
}

onMounted(async () => {
  // Guarantee a clean store regardless of context reuse between tests.
  await Promise.all([clearImpressionDraft(), clearImpressionMask()]);
  await refreshIdb();
});

async function onPersist() {
  prompt.value = "make it blue";
  usePaintMode.value = true;
  paintColor.value = "#213529";
  await persistDraft();
  await refreshIdb();
}

async function onPersistThenClear() {
  usePaintMode.value = true;
  useSolidMask.value = true;
  await persistDraft();
  await clearPersistedDraft();
  await refreshIdb();
}

async function onApplyMatch() {
  await setImpressionMask(new Blob(["m"], { type: "image/webp" }));
  matchResult.value = String(
    await applyDraftIfMatching({
      prompt: "restored prompt",
      source: "photo",
      renovation: null,
      impression: null,
      solidMask: true,
      paintColor: "#0A0A0A",
    }),
  );
}

async function onApplyMismatch() {
  matchResult.value = String(
    await applyDraftIfMatching({
      prompt: "leaked prompt",
      source: "original",
      renovation: "other-reno",
      impression: null,
    }),
  );
}

async function onEditPrompt() {
  prompt.value = "edited after establish";
  // The prompt watcher persists asynchronously; spin until IDB catches up so
  // the readout the test asserts on is deterministic.
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 10));
    if ((await getImpressionDraft())?.prompt === "edited after establish") break;
  }
  await refreshIdb();
}
</script>

<template>
  <div>
    <button data-testid="btn-persist" @click="onPersist">persist</button>
    <button data-testid="btn-persist-clear" @click="onPersistThenClear">
      persistClear
    </button>
    <button data-testid="btn-apply-match" @click="onApplyMatch">
      applyMatch
    </button>
    <button data-testid="btn-apply-mismatch" @click="onApplyMismatch">
      applyMismatch
    </button>
    <button data-testid="btn-edit-prompt" @click="onEditPrompt">
      editPrompt
    </button>

    <span data-testid="restored-key">{{ restoredDraftKey ?? "null" }}</span>
    <span data-testid="prompt">{{ prompt }}</span>
    <span data-testid="paint-mode">{{ usePaintMode }}</span>
    <span data-testid="solid-mask">{{ useSolidMask }}</span>
    <span data-testid="paint-color">{{ paintColor }}</span>
    <span data-testid="initial-mask">{{ initialMask ? "yes" : "no" }}</span>
    <span data-testid="match-result">{{ matchResult }}</span>
    <span data-testid="idb-prompt">{{ idbPrompt }}</span>
    <span data-testid="idb-paint">{{ idbPaint }}</span>
    <span data-testid="idb-has-mask">{{ idbHasMask ? "yes" : "no" }}</span>
    <span data-testid="idb-null">{{ idbDraftNull ? "yes" : "no" }}</span>
  </div>
</template>
