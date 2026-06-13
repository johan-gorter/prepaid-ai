<script setup lang="ts">
/**
 * Preview stage: the result-view footer (Overview | Trash | Share | Next
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

const props = defineProps<{
  renovationId: string | null;
  impressionId: string | null;
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
    shareUrl.value = `${location.origin}/share/${token}`;
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
  <!-- Preview stage footer (#91): Overview | [Trash] | [Share] | Next Change.
       Back action (Overview) far left, next action (Next Change) far right;
       the destructive Trash button is kept away from the primary Next Change. -->
  <StickyFooter>
    <button
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
