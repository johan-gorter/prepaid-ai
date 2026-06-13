<script setup lang="ts">
/**
 * Mask stage footer (#85): [Retake] | Trash | Undo | Next.
 *
 * Undo clears the whole mask — acceptable for a ~10 s sloppy mask — and sits
 * between the destructive Trash and the primary Next so the destructive action
 * is never adjacent to the primary one (viral-flow invariant #9).
 *
 * The shared MaskingCanvas itself stays mounted in NewImpressionPage so the
 * painted mask survives stage changes; this step only owns the footer.
 */
import StickyFooter from "../../../components/StickyFooter.vue";

defineProps<{ showRetake: boolean }>();

defineEmits<{
  clearMask: [];
  retake: [];
  trash: [];
  next: [];
}>();
</script>

<template>
  <!-- Mask stage footer: [Retake] | Trash | Undo | Next -->
  <StickyFooter>
    <button
      v-if="showRetake"
      class="max border small-round"
      @click="$emit('retake')"
    >
      <i aria-hidden="true">photo_camera</i>
      <span>{{ $t("newImpression.retake") }}</span>
    </button>
    <button class="max small-round error" @click="$emit('trash')">
      <i aria-hidden="true">delete</i>
      <span>{{ $t("newImpression.trash") }}</span>
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
