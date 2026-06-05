<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import {
  clearImpressionDraft,
  clearImpressionMask,
  setImpressionSource,
  setUncroppedSource,
} from "../composables/useImpressionStore";

const { t } = useI18n();
const router = useRouter();
const fileInput = ref<HTMLInputElement | null>(null);
const pasteError = ref<string | null>(null);

// Used by E2E tests via setInputFiles — bypasses the live camera page by
// stashing the file as the impression source and going straight to the mask
// stage of the unified wizard.
async function onCameraSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  await setImpressionSource(file);
  await Promise.all([clearImpressionMask(), clearImpressionDraft()]);
  router.push("/new-impression?source=photo");
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  await setUncroppedSource(file);
  router.push("/crop");
}

async function onPasteImage() {
  pasteError.value = null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith("image/"));
      if (imageType) {
        const blob = await item.getType(imageType);
        await setUncroppedSource(blob);
        router.push("/crop");
        return;
      }
    }
    pasteError.value = t("newRenovation.noImageClipboard");
  } catch {
    pasteError.value = t("newRenovation.clipboardError");
  }
}
</script>

<template>
  <div class="new-renovation-bar" data-testid="new-renovation-card">
    <div class="new-renovation-row">
      <h5 class="new-renovation-header">{{ $t("newRenovation.title") }}</h5>
      <!-- no-margin: Beer CSS's reset injects margin-top:1rem on a <nav> that
           follows a sibling (here the <h5>), which would push the actions down
           and break the row's vertical symmetry. -->
      <nav class="new-renovation-actions no-margin">
        <button @click="router.push('/photo')">
          <i aria-hidden="true">photo_camera</i>
          <span>{{ $t("newRenovation.takePhoto") }}</span>
        </button>
        <button @click="fileInput?.click()">
          <i aria-hidden="true">upload</i>
          <span>{{ $t("newRenovation.uploadImage") }}</span>
        </button>
        <button data-testid="paste-image-btn" @click="onPasteImage">
          <i aria-hidden="true">content_paste</i>
          <span>{{ $t("newRenovation.pasteImage") }}</span>
        </button>
      </nav>
    </div>
    <p v-if="pasteError" class="error-text small-text">{{ pasteError }}</p>
    <!-- Hidden input kept for E2E test compatibility (setInputFiles bypass) -->
    <input
      data-testid="camera-input"
      type="file"
      accept="image/*"
      hidden
      @change="onCameraSelected"
    />
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      hidden
      @change="onFileSelected"
    />
  </div>
</template>

<style scoped>
.new-renovation-bar {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  /* Match the page content's horizontal inset (AppBar nav + main both use
     0.5rem) so the header lines up under the app-bar title, while the
     border spans the full width as a separator above the photo grid. */
  padding: 0.75rem 0.5rem;
  border-bottom: 1px solid var(--outline-variant);
}

/* Header and the three actions share one line; the actions only drop onto
   their own row below 550px (see media query). */
.new-renovation-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.new-renovation-header {
  margin: 0;
  /* Grow on wider screens so the actions are pushed to the trailing edge,
     while staying shrinkable down to the title. */
  flex: 1 1 9rem;
  min-width: 0;
}

/* The three actions form a compact, equal-width group that hugs the trailing
   edge (the header owns the slack). They wrap among themselves only when the
   group gets too narrow to keep all three on one line. */
.new-renovation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  flex: 0 1 27rem;
  min-width: 0;
}

/* Compact, left-aligned action button: smaller radius and tighter padding than
   the default pill, icon stays put while the label wraps between words to ~2
   lines. The three share the row evenly (basis 0 + grow); each one's min-content
   (icon + the longest, unbroken word) is its floor, so they only reflow onto
   multiple rows once the row is too narrow to keep all three — i.e. extremely
   cramped — and the label never breaks mid-word. */
.new-renovation-actions button {
  flex: 1 1 0;
  margin: 0;
  height: auto;
  min-height: 2.5rem;
  padding: 0.375rem 0.5rem;
  gap: 0.25rem;
  border-radius: 0.5rem;
  justify-content: flex-start;
  text-align: left;
  font-size: 0.8125rem;
  line-height: 1.15;
}

.new-renovation-actions button i {
  flex: 0 0 auto;
  font-size: 1rem;
}

.new-renovation-actions button span {
  min-width: 0;
  white-space: normal;
}

/* Below 550px the actions drop onto their own row beneath the header and the
   three buttons stretch to fill the full width evenly. */
@media (max-width: 670px) {
  .new-renovation-row {
    flex-wrap: wrap;
  }

  .new-renovation-actions {
    flex-basis: 100%;
  }
}
</style>
