<script setup lang="ts">
/**
 * Material stage (apply-material flow): the user supplies a reference photo of
 * the material to apply to the masked surface (stone / wood / acoustic panels /
 * a ceiling finish, …). The photo comes in the same three ways as the room
 * photo — take / upload+crop / paste+crop — hosted INLINE here via the reusable
 * CameraCapture + ImageCropper components (no route detour, so the mask is
 * preserved and the funnel stays on /new-impression; see docs/photo-input.md).
 *
 * Returning users also see a grid of previously-used materials (the per-user
 * registry) so a repeat application is two taps: pick a remembered material →
 * Generate.
 *
 * Selection is mirrored to the parent through the `materialPath` model: a
 * registry pick sets the Storage path; a fresh capture/crop sets it to null and
 * stashes the blob under the "materialSource" IDB key (so the upload is deferred
 * to Generate and survives a buy-credits / sign-in detour). The parent's
 * generate pipeline resolves whichever is present.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import CameraCapture from "../../../components/CameraCapture.vue";
import ImageCropper from "../../../components/ImageCropper.vue";
import InternetTutorialDialog from "../../../components/InternetTutorialDialog.vue";
import StickyFooter from "../../../components/StickyFooter.vue";
import StorageImage from "../../../components/StorageImage.vue";
import {
  clearMaterialSource,
  getMaterialSource,
  setMaterialSource,
} from "../../../composables/useImpressionStore";
import { useMaterialsList } from "../../../composables/useMaterialsList";

const { t } = useI18n();

// Storage path of a chosen registry material; null when the selection is a fresh
// (not-yet-uploaded) capture whose blob lives in the materialSource IDB key.
const materialPath = defineModel<string | null>("materialPath", {
  required: true,
});

defineEmits<{
  back: [];
  generate: [];
}>();

const { materials, refresh } = useMaterialsList();

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
  () => !!selectedBlob.value || !!materialPath.value,
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
  // the stashed materialSource blob.
  if (!materialPath.value) {
    const blob = await getMaterialSource();
    if (blob) {
      selectedBlob.value = blob;
      setPreview(blob);
    }
  }
});

onBeforeUnmount(() => setPreview(null));

/** A fresh material image was captured or cropped. */
async function onMaterialChosen(blob: Blob) {
  selectedBlob.value = blob;
  materialPath.value = null;
  setPreview(blob);
  await setMaterialSource(blob);
  view.value = "pick";
}

/** A remembered material was picked from the grid. */
async function onPickExisting(path: string) {
  materialPath.value = path;
  selectedBlob.value = null;
  setPreview(null);
  await clearMaterialSource();
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
  await onMaterialChosen(await cropper.getBlob());
  uncroppedBlob.value = null;
}

function cancelSub() {
  uncroppedBlob.value = null;
  cameraError.value = null;
  view.value = "pick";
}

// E2E bypass for the live camera (mirrors the room-photo `camera-input`): a
// hidden file input whose selected file becomes the material directly.
function onCameraBypass(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  void onMaterialChosen(file);
  input.value = "";
}
</script>

<template>
  <div class="material-step" data-testid="material-step">
    <!-- PICK: registry grid + add affordances + current selection -->
    <template v-if="view === 'pick'">
      <p class="material-hint">{{ $t("newImpression.materialPickHint") }}</p>

      <div v-if="hasSelection" class="material-selected" data-testid="material-selected">
        <img
          v-if="previewUrl"
          class="material-preview"
          :src="previewUrl"
          :alt="$t('newImpression.materialSelectedAlt')"
        />
        <StorageImage
          v-else-if="materialPath"
          class="material-preview"
          :path="materialPath"
          :alt="$t('newImpression.materialSelectedAlt')"
        />
      </div>

      <section v-if="materials.length" class="material-recent">
        <h6 class="material-section-title">
          {{ $t("newImpression.materialRecent") }}
        </h6>
        <div class="material-grid" data-testid="material-grid">
          <button
            v-for="m in materials"
            :key="m.id"
            type="button"
            class="material-tile"
            :class="{ 'material-tile--active': materialPath === m.imagePath }"
            :data-testid="`material-tile-${m.id}`"
            @click="onPickExisting(m.imagePath)"
          >
            <StorageImage :path="m.imagePath" alt="" />
          </button>
        </div>
      </section>

      <h6 class="material-section-title">{{ $t("newImpression.materialAdd") }}</h6>
      <nav class="material-add-actions no-margin">
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
          data-testid="material-paste-btn"
          @click="onPasteImage"
        >
          <i aria-hidden="true">content_paste</i>
          <span>{{ $t("newRenovation.pasteImage") }}</span>
        </button>
        <button
          class="border small-round"
          data-testid="material-internet-btn"
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
        data-testid="material-camera-input"
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
          data-testid="material-generate"
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
        <p class="material-hint">{{ $t("photoCapture.positionHint") }}</p>
        <CameraCapture
          ref="cameraRef"
          @capture="onMaterialChosen"
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

    <!-- CROP: frame an uploaded / pasted material -->
    <template v-else>
      <p class="material-hint">{{ $t("crop.dragHint") }}</p>
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
.material-step {
  max-width: 544px;
  width: 100%;
  margin: 0.5rem auto 0;
  padding: 0 1rem;
  box-sizing: border-box;
}

.material-hint {
  text-align: center;
  font-size: 0.875rem;
  opacity: 0.8;
  margin: 0.25rem 0 0.75rem;
}

.material-selected {
  width: 8rem;
  margin: 0 auto 1rem;
}

.material-preview {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 0.5rem;
  border: 2px solid var(--primary, #6750a4);
}

.material-section-title {
  margin: 0.75rem 0 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  opacity: 0.8;
}

.material-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.material-tile {
  padding: 0;
  border: 2px solid var(--outline, rgba(0, 0, 0, 0.2));
  border-radius: 0.5rem;
  overflow: hidden;
  cursor: pointer;
  aspect-ratio: 1 / 1;
  min-width: 0;
}

.material-tile--active {
  border-color: var(--primary, #6750a4);
  box-shadow: 0 0 0 2px var(--primary, #6750a4);
}

.material-add-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* Two per row (2×2) on phones; each button's basis is half the row minus half
   the gap. They grow to share any extra width, so on roomier layouts the four
   can sit on a single row. */
.material-add-actions button {
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
