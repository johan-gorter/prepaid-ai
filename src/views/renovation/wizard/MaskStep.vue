<script setup lang="ts">
/**
 * Mask stage: the "clear mask" affordance plus the mask-stage footer
 * (optional Retake, Trash, Next). The shared MaskingCanvas itself stays
 * mounted in NewImpressionPage so the painted mask survives stage changes;
 * this step only owns the controls around it. (#85 rewrites this stage.)
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
  <button
    class="transparent small-round center-block"
    @click="$emit('clearMask')"
  >
    <i aria-hidden="true">delete_sweep</i>
    <span>{{ $t("newImpression.clearMask") }}</span>
  </button>

  <!-- Mask stage footer: [Retake] | Trash | Next -->
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
    <button class="max small-round" @click="$emit('next')">
      <i aria-hidden="true">arrow_forward</i>
      <span>{{ $t("newImpression.next") }}</span>
    </button>
  </StickyFooter>
</template>

<style scoped>
.center-block {
  display: block;
  margin: 0.5rem auto 0;
}
</style>
