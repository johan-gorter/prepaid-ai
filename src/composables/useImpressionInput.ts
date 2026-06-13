/**
 * Shared photo-input handlers for the renovation funnel entry points (the
 * signed-in gallery's NewRenovationCard and the signed-out FirstRenovationPage).
 *
 * All three input methods start the wizard without a login wall — see the
 * deferred-auth invariant in docs/viral-flow.md. Keep the three paths here so
 * both entry points stay in lockstep.
 */

import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import {
  clearImpressionDraft,
  clearImpressionMask,
  setImpressionSource,
  setUncroppedSource,
} from "./useImpressionStore";

export function useImpressionInput() {
  const { t } = useI18n();
  const router = useRouter();
  const fileInput = ref<HTMLInputElement | null>(null);
  const pasteError = ref<string | null>(null);

  function takePhoto() {
    void router.push("/photo");
  }

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
        const imageType = item.types.find((type) => type.startsWith("image/"));
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

  return {
    fileInput,
    pasteError,
    takePhoto,
    onCameraSelected,
    onFileSelected,
    onPasteImage,
  };
}
