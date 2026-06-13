<script setup lang="ts">
/**
 * Choose-action stage: the Remove / Paint / Other action menu plus its Back
 * footer. The canvas is hidden (but still mounted) behind this step. (#86
 * rewrites this stage.)
 */
import StickyFooter from "../../../components/StickyFooter.vue";

defineProps<{ removeCostLabel: string }>();

defineEmits<{
  remove: [];
  paint: [];
  other: [];
  back: [];
}>();
</script>

<template>
  <div class="choose-action-grid" data-testid="choose-action">
    <button
      class="small-round choose-action-button"
      data-testid="choose-remove"
      @click="$emit('remove')"
    >
      <i aria-hidden="true">delete_sweep</i>
      <span>{{ $t("newImpression.chooseRemove") }}</span>
      <span class="choose-action-cost">{{ removeCostLabel }}</span>
    </button>
    <button
      class="small-round choose-action-button"
      data-testid="choose-paint"
      @click="$emit('paint')"
    >
      <i aria-hidden="true">format_paint</i>
      <span>{{ $t("newImpression.choosePaint") }}</span>
    </button>
    <button
      class="small-round choose-action-button"
      data-testid="choose-other"
      @click="$emit('other')"
    >
      <i aria-hidden="true">tune</i>
      <span>{{ $t("newImpression.chooseOther") }}</span>
    </button>
  </div>

  <!-- Choose-action stage footer: Back -->
  <StickyFooter>
    <button class="max border small-round" @click="$emit('back')">
      <i aria-hidden="true">arrow_back</i>
      <span>{{ $t("newImpression.back") }}</span>
    </button>
  </StickyFooter>
</template>

<style scoped>
.choose-action-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 544px;
  margin: 1rem auto 0;
  padding: 0 1rem;
  box-sizing: border-box;
}

/* Beer CSS buttons default to `box-sizing: content-box`, so `width: 100%` +
   padding overflows the parent on narrow viewports. Force border-box here so
   the buttons fit within the grid's content area on mobile. */
.choose-action-button {
  width: 100%;
  padding: 1rem;
  justify-content: center;
  box-sizing: border-box;
  min-width: 0;
}

.choose-action-cost {
  margin-left: 0.5rem;
  font-weight: 600;
  opacity: 0.9;
}
</style>
