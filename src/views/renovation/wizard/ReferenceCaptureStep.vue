<script setup lang="ts">
/**
 * Reference-capture stage — shared by the "Apply material" and "Add furniture"
 * flows (the `kind` prop selects which). The user supplies a reference photo of
 * the thing to apply: a material to resurface the masked surface (stone / wood /
 * panels / a ceiling finish) or a piece of furniture to place into the masked
 * area. The photo comes in the same three ways as the room photo — take /
 * upload+crop / paste+crop — hosted INLINE here via the reusable CameraCapture +
 * ImageCropper components (no route detour, so the mask is preserved and the
 * funnel stays on /new-impression; see docs/photo-input.md).
 *
 * Returning users also see a grid of previously-used references (the per-user
 * registry, scoped by kind) so a repeat application is two taps: pick a
 * remembered reference → Generate.
 *
 * Selection is mirrored to the parent through the `selectedPath` model: a
 * registry pick sets the Storage path; a fresh capture/crop sets it to null and
 * stashes the blob under the "referenceSource:<kind>" IDB key (so the upload is
 * deferred to Generate and survives a buy-credits / sign-in detour). The
 * parent's generate pipeline resolves whichever is present.
 *
 * Kept distinct per kind so the two funnels stay separable: testids, i18n keys,
 * the registry subcollection, and the IDB key all carry the kind.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import CameraCapture from "../../../components/CameraCapture.vue";
import ImageCropper from "../../../components/ImageCropper.vue";
import InternetTutorialDialog from "../../../components/InternetTutorialDialog.vue";
import StickyFooter from "../../../components/StickyFooter.vue";
import StorageImage from "../../../components/StorageImage.vue";
import {
  clearReferenceSource,
  getReferenceSource,
  setReferenceSource,
} from "../../../composables/useImpressionStore";
import { useReferenceImagesList } from "../../../composables/useReferenceImagesList";
import type { ReferenceKind } from "../../../data/referenceImageRepo";

const props = defineProps<{ kind: ReferenceKind }>();

const { t } = useI18n();

// Storage path of a chosen registry reference; null when the selection is a
// fresh (not-yet-uploaded) capture whose blob lives in the referenceSource IDB
// key.
const selectedPath = defineModel<string | null>("selectedPath", {
  required: true,
});

defineEmits<{
  back: [];
  generate: [];
}>();

// i18n keys and testids are namespaced by kind so material and furniture stay
// independently labelled and independently selectable in tests.
const tk = (suffix: string) => t(`newImpression.${props.kind}${suffix}`);
const tid = (suffix: string) => `${props.kind}-${suffix}`;

const { images, refresh } = useReferenceImagesList(props.kind);

type View = "pick" | "camera" | "crop";
const view = ref<View>("pick");

// The active selection (either a fresh blob preview or a registry path).
const selectedBlob = ref<Blob | null>(null);
const previewUrl = ref<string | null>(null);
const pasteError = ref<string | null>(null);

// "From internet" opens a tutorial explaining how to copy a web image onto the
// clipboard; the user then returns and pastes via the "Paste image" action.
const showInternetTutorial = ref(false);

// Blob feeding the inline cropper (upload / paste before confirming the crop).
const uncroppedBlob = ref<Blob | null>(null);

const cameraRef = ref<InstanceType<typeof CameraCapture> | null>(null);
const cameraReady = ref(false);
const cameraError = ref<string | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);

const hasSelection = computed(
  () => !!selectedBlob.value || !!selectedPath.value,
);

function setPreview(blob: Blob | null) {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }
  if (blob) previewUrl.value = URL.createObjectURL(blob);
}

onMounted(async () => {
  void refresh();
  // Restore a selection left behind by a buy-credits / sign-in detour: a
  // registry path comes back through the model; a fresh capture comes back as
  // the stashed referenceSource blob.
  if (!selectedPath.value) {
    const blob = await getReferenceSource(props.kind);
    if (blob) {
      selectedBlob.value = blob;
      setPreview(blob);
    }
  }
});

onBeforeUnmount(() => setPreview(null));

/** A fresh reference image was captured or cropped. */
async function onReferenceChosen(blob: Blob) {
  selectedBlob.value = blob;
  selectedPath.value = null;
  setPreview(blob);
  await setReferenceSource(props.kind, blob);
  view.value = "pick";
}

/** A remembered reference was picked from the grid. */
async function onPickExisting(path: string) {
  selectedPath.value = path;
  selectedBlob.value = null;
  setPreview(null);
  await clearReferenceSource(props.kind);
}

function onUploadClick() {
  pasteError.value = null;
  uploadInput.value?.click();
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  uncroppedBlob.value = file;
  view.value = "crop";
  input.value = "";
}

async function onPasteImage() {
  pasteError.value = null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (imageType) {
        uncroppedBlob.value = await item.getType(imageType);
        view.value = "crop";
        return;
      }
    }
    pasteError.value = t("newRenovation.noImageClipboard");
  } catch {
    pasteError.value = t("newRenovation.clipboardError");
  }
}

function startCamera() {
  cameraError.value = null;
  cameraReady.value = false;
  view.value = "camera";
}

const cropperRef = ref<InstanceType<typeof ImageCropper> | null>(null);

async function confirmCrop() {
  const cropper = cropperRef.value;
  if (!cropper) return;
  await onReferenceChosen(await cropper.getBlob());
  uncroppedBlob.value = null;
}

function cancelSub() {
  uncroppedBlob.value = null;
  cameraError.value = null;
  view.value = "pick";
}

// E2E bypass for the live camera (mirrors the room-photo `camera-input`): a
// hidden file input whose selected file becomes the reference directly.
function onCameraBypass(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  void onReferenceChosen(file);
  input.value = "";
}
</script>

<template>
  <div class="reference-step" :data-testid="tid('step')">
    <!-- PICK: registry grid + add affordances + current selection -->
    <template v-if="view === 'pick'">
      <p class="reference-hint">{{ tk("PickHint") }}</p>

      <div
        v-if="hasSelection"
        class="reference-selected"
        :data-testid="tid('selected')"
      >
        <img
          v-if="previewUrl"
          class="reference-preview"
          :src="previewUrl"
          :alt="tk('SelectedAlt')"
        />
        <StorageImage
          v-else-if="selectedPath"
          class="reference-preview"
          :path="selectedPath"
          :alt="tk('SelectedAlt')"
        />
      </div>

      <section v-if="images.length" class="reference-recent">
        <h6 class="reference-section-title">
          {{ tk("Recent") }}
        </h6>
        <div class="reference-grid" :data-testid="tid('grid')">
          <button
            v-for="m in images"
            :key="m.id"
            type="button"
            class="reference-tile"
            :class="{ 'reference-tile--active': selectedPath === m.imagePath }"
            :data-testid="tid(`tile-${m.id}`)"
            @click="onPickExisting(m.imagePath)"
          >
            <StorageImage :path="m.imagePath" alt="" />
          </button>
        </div>
      </section>

      <h6 class="reference-section-title">{{ tk("Add") }}</h6>
      <nav class="reference-add-actions no-margin">
        <button class="border small-round" @click="startCamera">
          <i aria-hidden="true">photo_camera</i>
          <span>{{ $t("newRenovation.takePhoto") }}</span>
        </button>
        <button class="border small-round" @click="onUploadClick">
          <i aria-hidden="true">upload</i>
          <span>{{ $t("newRenovation.uploadImage") }}</span>
        </button>
        <button
          class="border small-round"
          :data-testid="tid('paste-btn')"
          @click="onPasteImage"
        >
          <i aria-hidden="true">content_paste</i>
          <span>{{ $t("newRenovation.pasteImage") }}</span>
        </button>
        <button
          class="border small-round"
          :data-testid="tid('internet-btn')"
          @click="showInternetTutorial = true"
        >
          <i aria-hidden="true">travel_explore</i>
          <span>{{ $t("newRenovation.fromInternet") }}</span>
        </button>
      </nav>
      <p v-if="pasteError" class="error-text small-text">{{ pasteError }}</p>

      <input
        ref="uploadInput"
        type="file"
        accept="image/*"
        hidden
        @change="onFileSelected"
      />
      <!-- Hidden bypass for E2E (setInputFiles) — skips the live camera. -->
      <input
        :data-testid="tid('camera-input')"
        type="file"
        accept="image/*"
        hidden
        @change="onCameraBypass"
      />

      <InternetTutorialDialog
        :open="showInternetTutorial"
        @close="showInternetTutorial = false"
      />

      <StickyFooter>
        <button class="max border small-round" @click="$emit('back')">
          <i aria-hidden="true">arrow_back</i>
          <span>{{ $t("newImpression.back") }}</span>
        </button>
        <div class="small-space"></div>
        <button
          class="max small-round"
          :data-testid="tid('generate')"
          :disabled="!hasSelection"
          @click="$emit('generate')"
        >
          <i aria-hidden="true">auto_awesome</i>
          <span>{{ $t("newImpression.generate") }}</span>
        </button>
      </StickyFooter>
    </template>

    <!-- CAMERA: live capture -->
    <template v-else-if="view === 'camera'">
      <div v-if="cameraError" class="error-panel center-align">
        <i aria-hidden="true" style="font-size: 3rem">no_photography</i>
        <p>{{ cameraError }}</p>
      </div>
      <template v-else>
        <p class="reference-hint">{{ $t("photoCapture.positionHint") }}</p>
        <CameraCapture
          ref="cameraRef"
          @capture="onReferenceChosen"
          @ready="cameraReady = $event"
          @error="cameraError = t('photoCapture.cameraError')"
        />
      </template>
      <StickyFooter>
        <button class="max border small-round" @click="cancelSub">
          <i aria-hidden="true">close</i>
          <span>{{ $t("common.cancel") }}</span>
        </button>
        <div class="small-space"></div>
        <button
          v-if="!cameraError"
          class="max small-round"
          :disabled="!cameraReady"
          @click="cameraRef?.capture()"
          :aria-label="$t('photoCapture.capturePhotoAria')"
        >
          <i aria-hidden="true">camera</i>
          <span>{{ $t("photoCapture.capture") }}</span>
        </button>
      </StickyFooter>
    </template>

    <!-- CROP: frame an uploaded / pasted reference -->
    <template v-else>
      <p class="reference-hint">{{ $t("crop.dragHint") }}</p>
      <ImageCropper
        v-if="uncroppedBlob"
        ref="cropperRef"
        :source="uncroppedBlob"
        :zoom-in-label="$t('crop.zoomIn')"
        :zoom-out-label="$t('crop.zoomOut')"
      />
      <StickyFooter>
        <button class="max border small-round" @click="cancelSub">
          <i aria-hidden="true">close</i>
          <span>{{ $t("common.cancel") }}</span>
        </button>
        <div class="small-space"></div>
        <button class="max small-round" @click="confirmCrop">
          <i aria-hidden="true">check</i>
          <span>{{ $t("crop.useImage") }}</span>
        </button>
      </StickyFooter>
    </template>
  </div>
</template>

<style scoped>
.reference-step {
  max-width: 544px;
  width: 100%;
  margin: 0.5rem auto 0;
  padding: 0 1rem;
  box-sizing: border-box;
}

.reference-hint {
  text-align: center;
  font-size: 0.875rem;
  opacity: 0.8;
  margin: 0.25rem 0 0.75rem;
}

.reference-selected {
  width: 8rem;
  margin: 0 auto 1rem;
}

.reference-preview {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 0.5rem;
  border: 2px solid var(--primary, #6750a4);
}

.reference-section-title {
  margin: 0.75rem 0 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  opacity: 0.8;
}

.reference-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.reference-tile {
  padding: 0;
  border: 2px solid var(--outline, rgba(0, 0, 0, 0.2));
  border-radius: 0.5rem;
  overflow: hidden;
  cursor: pointer;
  aspect-ratio: 1 / 1;
  min-width: 0;
}

.reference-tile--active {
  border-color: var(--primary, #6750a4);
  box-shadow: 0 0 0 2px var(--primary, #6750a4);
}

.reference-add-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* Two per row (2×2) on phones; each button's basis is half the row minus half
   the gap. They grow to share any extra width, so on roomier layouts the four
   can sit on a single row. */
.reference-add-actions button {
  flex: 1 1 calc(50% - 0.25rem);
  margin: 0;
  min-width: 0;
}

.error-panel {
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}
</style>
