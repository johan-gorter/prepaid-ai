<script setup lang="ts">
/**
 * Custom colour picker for the paint step, v-model'd on a `#RRGGBB` string.
 *
 * Three native range sliders (hue / saturation / lightness) drive the colour,
 * with a large live preview below holding an editable hex field. Native
 * `<input type="range">` gives touch / keyboard / screen-reader behaviour for
 * free and identical on every platform — only the tracks/thumbs are styled.
 *
 * State model: `h` / `s` / `l` are the canonical state while sliding and
 * `model` (hex) is derived from them. We recompute h/s/l *from* a hex only when
 * the model changes externally (a standard swatch click) or the user types a
 * valid hex — round-tripping hex→HSL→hex on every input would jitter the
 * sliders.
 */
import { computed, ref, watch } from "vue";
import { contrastText, hexToHsl, hslToHex, normalizeHex } from "./colorUtils";

const model = defineModel<string>({ required: true });

const h = ref(0);
const s = ref(0);
const l = ref(0);

// The last hex we pushed to the model, so the model watcher can distinguish an
// external change (swatch click) from the echo of our own slider/hex update.
let lastEmitted = "";

function syncFromHex(hex: string): void {
  const hsl = hexToHsl(hex);
  if (!hsl) return;
  h.value = hsl.h;
  s.value = hsl.s;
  l.value = hsl.l;
}

syncFromHex(model.value);

watch(model, (next) => {
  if (next === lastEmitted) return;
  syncFromHex(next);
});

function setColor(hex: string): void {
  lastEmitted = hex;
  model.value = hex;
}

function onSlide(channel: "h" | "s" | "l", event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (channel === "h") h.value = value;
  else if (channel === "s") s.value = value;
  else l.value = value;
  setColor(hslToHex({ h: h.value, s: s.value, l: l.value }));
}

// The hex field is editable and decoupled from the model while typing, so a
// partial value (e.g. "#A89") doesn't get reformatted out from under the user.
// Only a valid #RRGGBB updates the colour + slider state.
const hexInput = ref(model.value.toUpperCase());
watch(model, (next) => {
  hexInput.value = next.toUpperCase();
});

function onHexInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  hexInput.value = raw;
  const normalized = normalizeHex(raw);
  if (normalized) {
    syncFromHex(normalized);
    setColor(normalized);
  }
}

const textColor = computed(() => contrastText(model.value));
</script>

<template>
  <div
    class="hsl-picker"
    data-testid="paint-custom"
    :style="{ '--h': h, '--s': `${s}%`, '--l': `${l}%` }"
  >
    <div class="sliders">
      <input
        type="range"
        class="slider slider--hue"
        min="0"
        max="360"
        :value="h"
        :aria-label="$t('newImpression.paintHue')"
        @input="onSlide('h', $event)"
      />
      <input
        type="range"
        class="slider slider--sat"
        min="0"
        max="100"
        :value="s"
        :aria-label="$t('newImpression.paintSaturation')"
        @input="onSlide('s', $event)"
      />
      <input
        type="range"
        class="slider slider--light"
        min="0"
        max="100"
        :value="l"
        :aria-label="$t('newImpression.paintLightness')"
        @input="onSlide('l', $event)"
      />
    </div>

    <div class="preview" :style="{ backgroundColor: model }">
      <input
        type="text"
        class="hex-input"
        data-testid="paint-color"
        :value="hexInput"
        :style="{
          color: textColor,
          borderColor: textColor,
          caretColor: textColor,
        }"
        :aria-label="$t('newImpression.paintColorLabel')"
        autocapitalize="characters"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        maxlength="7"
        @input="onHexInput"
      />
    </div>
  </div>
</template>

<style scoped>
.hsl-picker {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 1rem;
  padding: 1rem 0 0;
  box-sizing: border-box;
}

.sliders {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Native range, custom track/thumb only. Full width of the column. */
.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 1.5rem;
  margin: 0;
  background: transparent;
  cursor: pointer;
}

.slider:focus-visible {
  outline: 2px solid var(--primary, #6750a4);
  outline-offset: 4px;
  border-radius: 0.75rem;
}

/* Track backgrounds reflect the live colour via the --h/--s/--l custom
   properties bound from Vue. */
.slider--hue::-webkit-slider-runnable-track {
  background: linear-gradient(
    to right,
    hsl(0 100% 50%),
    hsl(60 100% 50%),
    hsl(120 100% 50%),
    hsl(180 100% 50%),
    hsl(240 100% 50%),
    hsl(300 100% 50%),
    hsl(360 100% 50%)
  );
}
.slider--hue::-moz-range-track {
  background: linear-gradient(
    to right,
    hsl(0 100% 50%),
    hsl(60 100% 50%),
    hsl(120 100% 50%),
    hsl(180 100% 50%),
    hsl(240 100% 50%),
    hsl(300 100% 50%),
    hsl(360 100% 50%)
  );
}

.slider--sat::-webkit-slider-runnable-track {
  background: linear-gradient(
    to right,
    hsl(var(--h) 0% var(--l)),
    hsl(var(--h) 100% var(--l))
  );
}
.slider--sat::-moz-range-track {
  background: linear-gradient(
    to right,
    hsl(var(--h) 0% var(--l)),
    hsl(var(--h) 100% var(--l))
  );
}

.slider--light::-webkit-slider-runnable-track {
  background: linear-gradient(
    to right,
    hsl(var(--h) var(--s) 0%),
    hsl(var(--h) var(--s) 50%),
    hsl(var(--h) var(--s) 100%)
  );
}
.slider--light::-moz-range-track {
  background: linear-gradient(
    to right,
    hsl(var(--h) var(--s) 0%),
    hsl(var(--h) var(--s) 50%),
    hsl(var(--h) var(--s) 100%)
  );
}

.slider::-webkit-slider-runnable-track {
  height: 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.2);
}
.slider::-moz-range-track {
  height: 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.2);
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 1.5rem;
  height: 1.5rem;
  margin-top: -0.45rem;
  border-radius: 50%;
  background: #fff;
  border: 2px solid rgba(0, 0, 0, 0.55);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.slider::-moz-range-thumb {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: #fff;
  border: 2px solid rgba(0, 0, 0, 0.55);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

.preview {
  flex: 1;
  min-height: 6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  border: 1px solid var(--outline, rgba(0, 0, 0, 0.2));
}

.hex-input {
  width: 9ch;
  padding: 0.5rem 0.25rem;
  font-family: monospace;
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-align: center;
  text-transform: uppercase;
  background: transparent;
  border: none;
  border-bottom: 2px solid currentColor;
  outline: none;
}
</style>
