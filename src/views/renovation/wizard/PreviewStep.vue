<script setup lang="ts">
/**
 * Preview stage: the result-view footer (Timeline | Trash | Share | Next
 * Change) and the share-link dialog. The result image itself is the shared
 * canvas / result-marker owned by the page. (#90 adds the fullscreen viewer
 * here; #91 reordered this footer to the app-wide convention — back action
 * far left, next action far right, destructive Trash never adjacent to the
 * primary Next Change.)
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import StickyFooter from "../../../components/StickyFooter.vue";
import ShareDialog from "../../../components/ShareDialog.vue";
import { createOrGetShareToken } from "../../../composables/useShare";
import { track } from "../../../composables/useTrack";

const props = defineProps<{
  renovationId: string | null;
  impressionId: string | null;
  showTimelineButton: boolean;
  showShareButton: boolean;
  showTrashButton: boolean;
}>();

const emit = defineEmits<{
  renovationDetails: [];
  trash: [];
  nextChange: [];
  error: [message: string];
}>();

const { t } = useI18n();

const shareDialogOpen = ref(false);
const shareUrl = ref("");
const sharePending = ref(false);

async function onShare() {
  if (sharePending.value) return;
  if (!props.renovationId || !props.impressionId) return;
  sharePending.value = true;
  try {
    const token = await createOrGetShareToken(
      props.renovationId,
      props.impressionId,
    );
    // Wow-to-share — the start of the viral loop (measurement.md).
    track("share_created");
    const url = `${location.origin}/share/${token}`;
    shareUrl.value = url;

    // Prefer the OS share sheet (Android Chrome, iOS Safari, Windows Edge):
    // more native, one tap to WhatsApp/Messages/etc. Fall back to the
    // copy-link dialog where navigator.share is unavailable or the share
    // can't be performed. A user-cancelled share (AbortError) is a no-op.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: t("share.shareText"), url });
        return;
      } catch (shareErr) {
        if (shareErr instanceof DOMException && shareErr.name === "AbortError") {
          return;
        }
        // Any other failure: fall through to the copy-link dialog.
      }
    }
    shareDialogOpen.value = true;
  } catch (err) {
    emit(
      "error",
      err instanceof Error ? err.message : t("newImpression.failedShareLink"),
    );
  } finally {
    sharePending.value = false;
  }
}
</script>

<template>
  <!-- Preview stage footer (#91): Timeline | [Trash] | [Share] | Next Change.
       Back action (Timeline) far left, next action (Next Change) far right;
       the destructive Trash button is kept away from the primary Next Change. -->
  <StickyFooter>
    <button
      v-if="showTimelineButton"
      class="max small-round"
      @click="$emit('renovationDetails')"
      :aria-label="$t('newImpression.renovationDetails')"
    >
      <i aria-hidden="true">timeline</i>
      <span>{{ $t("newImpression.renovationDetails") }}</span>
    </button>
    <button
      v-if="showTrashButton"
      class="max small-round error"
      @click="$emit('trash')"
    >
      <i aria-hidden="true">delete</i>
      <span>{{ $t("newImpression.trash") }}</span>
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
      class="max small-round"
      @click="$emit('nextChange')"
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
</template>
