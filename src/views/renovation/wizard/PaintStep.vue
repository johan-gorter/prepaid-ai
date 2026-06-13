<script setup lang="ts">
/**
 * Paint stage: standard grouped swatches / custom HSL picker tabs plus the
 * Back | Generate footer. The chosen colour is v-model'd back to the page so
 * the draft can persist it across a sign-in detour.
 *
 * Single source of truth is the current colour (`paintColor`): clicking a
 * swatch sets it, and the custom picker derives its slider state from it, so
 * the tabs always agree. A swatch renders as selected iff its hex equals the
 * current colour — no separate "selected swatch" state is stored.
 */
import { ref } from "vue";
import StickyFooter from "../../../components/StickyFooter.vue";
import HslColorPicker from "../../../components/HslColorPicker.vue";
import { contrastText } from "../../../components/colorUtils";
import { PAINT_PRESET_GROUPS } from "./paintPresets";

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
      class="paint-standard"
      data-testid="paint-standard"
    >
      <section
        v-for="group in PAINT_PRESET_GROUPS"
        :key="group.titleKey"
        class="paint-group"
      >
        <h6 class="paint-group-title">{{ $t(group.titleKey) }}</h6>
        <div class="paint-swatch-grid">
          <button
            v-for="swatch in group.swatches"
            :key="swatch.hex"
            type="button"
            class="paint-swatch"
            :class="{ 'paint-swatch--active': paintColor === swatch.hex }"
            :style="{ backgroundColor: swatch.hex, color: contrastText(swatch.hex) }"
            :title="swatch.label"
            :aria-label="swatch.label"
            :aria-pressed="paintColor === swatch.hex"
            :data-testid="`paint-swatch-${swatch.hex}`"
            @click="paintColor = swatch.hex"
          >
            <span class="paint-swatch-label">{{ swatch.label }}</span>
          </button>
        </div>
      </section>
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
  width: 100%;
  margin: 1rem auto 0;
  padding: 0 1rem;
  box-sizing: border-box;
  /* Fill the space between the title and the fixed footer so the custom
     picker's preview can grow as large as possible (#87). */
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.paint-step .tabs {
  margin-bottom: 1rem;
}

/* The standard tab may overflow the available height; let it scroll while the
   tabs and footer stay put. */
.paint-standard {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.paint-group + .paint-group {
  margin-top: 1.25rem;
}

.paint-group-title {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  opacity: 0.8;
}

.paint-swatch-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.paint-swatch {
  /* Wide, low-profile chips so the full label fits across the swatch. */
  height: 3rem;
  width: 100%;
  /* Grid items default to min-width:auto, which refuses to shrink below the
     label's intrinsic width and overflows the row at ~320px. Let them shrink
     to their 1fr track and wrap the label instead. border-box keeps the
     padding + border inside that track rather than adding to it. */
  min-width: 0;
  box-sizing: border-box;
  padding: 0 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--outline, rgba(0, 0, 0, 0.2));
  border-radius: 0.5rem;
  cursor: pointer;
}

.paint-swatch-label {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.1;
  text-align: center;
  overflow-wrap: anywhere;
}

.paint-swatch--active {
  border-color: var(--primary, #6750a4);
  box-shadow: 0 0 0 2px var(--primary, #6750a4);
}
</style>
