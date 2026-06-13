<script setup lang="ts">
/**
 * Custom colour picker for the paint step, v-model'd on a `#RRGGBB` string.
 *
 * Today this wraps the native `<input type="color">` plus a hex readout —
 * behaviour-identical to the inline picker it replaced. Issue #87 will swap
 * the internals for three HSL sliders; keeping it a standalone, CT-testable
 * component is what lets that rewrite touch only this file.
 */
const model = defineModel<string>({ required: true });
</script>

<template>
  <div class="paint-custom" data-testid="paint-custom">
    <input
      type="color"
      v-model="model"
      class="paint-color-input"
      data-testid="paint-color"
      :aria-label="$t('newImpression.paintColorLabel')"
    />
    <span class="paint-hex">{{ model.toUpperCase() }}</span>
  </div>
</template>

<style scoped>
.paint-custom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 0;
}

.paint-color-input {
  width: 100%;
  max-width: 240px;
  height: 8rem;
  padding: 0;
  border: 1px solid var(--outline, rgba(0, 0, 0, 0.2));
  border-radius: 0.75rem;
  background: none;
  cursor: pointer;
}

.paint-hex {
  font-family: monospace;
  font-size: 1.1rem;
}
</style>
