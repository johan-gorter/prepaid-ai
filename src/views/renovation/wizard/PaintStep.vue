<script setup lang="ts">
/**
 * Paint stage: standard-swatch / custom-colour tabs plus the Back | Generate
 * footer. The chosen colour is v-model'd back to the page so the draft can
 * persist it across a sign-in detour. (#87 rewrites this stage and grows the
 * swatch set / HslColorPicker.)
 */
import { ref } from "vue";
import StickyFooter from "../../../components/StickyFooter.vue";
import HslColorPicker from "../../../components/HslColorPicker.vue";
import { PAINT_PRESETS } from "./paintPresets";

const paintColor = defineModel<string>({ required: true });

defineEmits<{
  back: [];
  generate: [];
}>();

// Each fresh entry into the paint stage starts on the standard swatches, so
// this is local component state rather than a persisted draft field.
const paintTab = ref<"standard" | "custom">("standard");
</script>

<template>
  <div class="paint-step" data-testid="paint-step">
    <div class="tabs">
      <a
        :class="{ active: paintTab === 'standard' }"
        data-testid="paint-tab-standard"
        @click="paintTab = 'standard'"
      >
        <i aria-hidden="true">palette</i>
        <span>{{ $t("newImpression.paintTabStandard") }}</span>
      </a>
      <a
        :class="{ active: paintTab === 'custom' }"
        data-testid="paint-tab-custom"
        @click="paintTab = 'custom'"
      >
        <i aria-hidden="true">colorize</i>
        <span>{{ $t("newImpression.paintTabCustom") }}</span>
      </a>
    </div>

    <div
      v-if="paintTab === 'standard'"
      class="paint-swatch-grid"
      data-testid="paint-standard"
    >
      <button
        v-for="preset in PAINT_PRESETS"
        :key="preset.hex"
        type="button"
        class="paint-swatch"
        :class="{ 'paint-swatch--active': paintColor === preset.hex }"
        :style="{ backgroundColor: preset.hex }"
        :title="preset.name"
        :aria-label="preset.name"
        :aria-pressed="paintColor === preset.hex"
        :data-testid="`paint-swatch-${preset.hex}`"
        @click="paintColor = preset.hex"
      ></button>
    </div>

    <HslColorPicker v-else v-model="paintColor" />
  </div>

  <!-- Paint stage footer: Back | Generate -->
  <StickyFooter>
    <button class="max border small-round" @click="$emit('back')">
      <i aria-hidden="true">arrow_back</i>
      <span>{{ $t("newImpression.back") }}</span>
    </button>
    <div class="small-space"></div>
    <button
      class="max small-round"
      data-testid="paint-generate"
      @click="$emit('generate')"
    >
      <i aria-hidden="true">auto_awesome</i>
      <span>{{ $t("newImpression.generate") }}</span>
    </button>
  </StickyFooter>
</template>

<style scoped>
.paint-step {
  max-width: 544px;
  margin: 1rem auto 0;
  padding: 0 1rem;
  box-sizing: border-box;
}

.paint-step .tabs {
  margin-bottom: 1rem;
}

.paint-swatch-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.paint-swatch {
  aspect-ratio: 1;
  width: 100%;
  padding: 0;
  border: 2px solid var(--outline, rgba(0, 0, 0, 0.2));
  border-radius: 0.5rem;
  cursor: pointer;
}

.paint-swatch--active {
  border-color: var(--primary, #6750a4);
  box-shadow: 0 0 0 2px var(--primary, #6750a4);
}
</style>
