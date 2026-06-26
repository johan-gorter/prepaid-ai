<script setup lang="ts">
/**
 * Mask stage footer (#85): [Retake] | Trash | Timeline | Undo | Next.
 *
 * Trash and Timeline are mutually exclusive and chosen by the page from the
 * source: a fresh photo/crop (no renovation yet) shows Trash to discard the
 * in-progress photo; an existing renovation (original/impression) shows
 * Timeline to back out to the renovation timeline. Mid-mask, an existing
 * renovation never offers Trash — that would mean deleting the parent
 * impression/renovation while editing. A share recipient shows neither.
 *
 * Both sit far from the primary Next so the destructive Trash is never
 * adjacent to it (viral-flow invariant #9). Undo clears the whole mask —
 * acceptable for a ~10 s sloppy mask.
 *
 * The shared MaskingCanvas itself stays mounted in NewImpressionPage so the
 * painted mask survives stage changes; this step only owns the footer.
 */
import StickyFooter from "../../../components/StickyFooter.vue";

defineProps<{
  showRetake: boolean;
  showTrash: boolean;
  showTimeline: boolean;
}>();

defineEmits<{
  clearMask: [];
  retake: [];
  trash: [];
  renovationDetails: [];
  next: [];
}>();
</script>

<template>
  <!-- Mask stage footer: [Retake] | [Trash] | [Timeline] | Undo | Next -->
  <StickyFooter>
    <button
      v-if="showRetake"
      class="max border small-round"
      @click="$emit('retake')"
    >
      <i aria-hidden="true">photo_camera</i>
      <span>{{ $t("newImpression.retake") }}</span>
    </button>
    <button
      v-if="showTrash"
      class="max small-round error"
      @click="$emit('trash')"
    >
      <i aria-hidden="true">delete</i>
      <span>{{ $t("newImpression.trash") }}</span>
    </button>
    <button
      v-if="showTimeline"
      class="max small-round"
      @click="$emit('renovationDetails')"
      :aria-label="$t('newImpression.renovationDetails')"
    >
      <i aria-hidden="true">timeline</i>
      <span>{{ $t("newImpression.renovationDetails") }}</span>
    </button>
    <button class="max border small-round" @click="$emit('clearMask')">
      <i aria-hidden="true">undo</i>
      <span>{{ $t("newImpression.undo") }}</span>
    </button>
    <button class="max small-round" @click="$emit('next')">
      <i aria-hidden="true">arrow_forward</i>
      <span>{{ $t("newImpression.next") }}</span>
    </button>
  </StickyFooter>
</template>
