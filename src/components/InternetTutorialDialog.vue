<script setup lang="ts">
/**
 * Tutorial that explains how to bring an image in from the web: long-press an
 * image on another site, copy it, then paste it back into payasyougo.app. The
 * three illustrated steps come from the designer (src/assets/tutorial). The CTA
 * opens Google Images in a new tab so the user can go find an image, then
 * returns to this tab to paste via the existing "Paste image" action.
 */
import step1 from "../assets/tutorial/step1.png";
import step2 from "../assets/tutorial/step2.png";
import step3 from "../assets/tutorial/step3.png";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

function onFindImage() {
  // Open Google Images in a new tab to go find a picture. Triggered from a
  // click (user gesture) so it isn't treated as a blocked popup.
  window.open("https://www.google.com/imghp", "_blank", "noopener");
  emit("close");
}
</script>

<template>
  <!-- Beer CSS backdrop scrim; clicking it dismisses the dialog. Rendered
       before the dialog so the dialog (same z-index) paints on top. -->
  <div
    class="overlay"
    :class="{ active: open }"
    data-testid="internet-tutorial-backdrop"
    @click="emit('close')"
  ></div>

  <dialog
    :class="{ active: open }"
    class="tutorial-dialog"
    data-testid="internet-tutorial-dialog"
  >
    <header class="tutorial-head">
      <h5 class="tutorial-title">{{ $t("internetTutorial.title") }}</h5>
      <button
        type="button"
        class="circle transparent small tutorial-close"
        :aria-label="$t('internetTutorial.close')"
        data-testid="internet-tutorial-close"
        @click="emit('close')"
      >
        <i aria-hidden="true">close</i>
      </button>
    </header>

    <ol class="tutorial-steps">
      <li class="tutorial-step">
        <img class="tutorial-img" :src="step1" :alt="$t('internetTutorial.step1')" />
        <p class="tutorial-text">{{ $t("internetTutorial.step1") }}</p>
      </li>
      <li class="tutorial-step">
        <img class="tutorial-img" :src="step2" :alt="$t('internetTutorial.step2')" />
        <p class="tutorial-text">{{ $t("internetTutorial.step2") }}</p>
      </li>
      <li class="tutorial-step">
        <img class="tutorial-img" :src="step3" :alt="$t('internetTutorial.step3')" />
        <p class="tutorial-text">{{ $t("internetTutorial.step3") }}</p>
      </li>
    </ol>

    <button
      type="button"
      class="tutorial-cta small-round"
      data-testid="internet-tutorial-cta"
      @click="onFindImage"
    >
      <i aria-hidden="true">travel_explore</i>
      <span>{{ $t("internetTutorial.cta") }}</span>
    </button>
  </dialog>
</template>

<style scoped>
/* A single layout at every size: the header and CTA stay pinned while the
   steps scroll, so the dialog fits from 300px-wide phones up to short
   landscape viewports without anything falling off. */
.tutorial-dialog {
  width: min(92vw, 28rem);
  max-width: 92vw;
  /* Override Beer's `min-inline-size: 20rem` (which would overflow <320px). */
  min-inline-size: auto;
  /* Override Beer's `max-block-size: 80%` so a short (rotated) viewport still
     leaves room and the steps scroll instead of pushing the CTA off-screen. */
  max-block-size: 88vh;
  padding: 1rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow: hidden;
}

.tutorial-head {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0;
}

.tutorial-title {
  margin: 0;
  min-width: 0;
  font-size: 1.25rem;
  line-height: 1.2;
}

.tutorial-close {
  flex: 0 0 auto;
  margin: -0.25rem -0.25rem 0 0;
}

/* The scrollable middle. min-height:0 lets it shrink inside the flex column so
   the CTA below stays visible on short screens. */
.tutorial-steps {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Each step is thumbnail-left / label-right, and the three steps always stack
   vertically. The thumbnails are never laid out in a horizontal row — that
   broke on rotation (labels and CTA fell off). */
.tutorial-step {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.tutorial-img {
  flex: 0 0 auto;
  width: 4.75rem;
  height: auto;
  aspect-ratio: 163 / 134;
  object-fit: cover;
  border-radius: 0.5rem;
  /* Matches the illustrations' baked-in backdrop so they blend in either
     colour scheme. */
  background: #25262a;
}

.tutorial-text {
  margin: 0;
  min-width: 0;
  font-size: 0.95rem;
  line-height: 1.25;
}

/* Sized to its label and centred rather than stretched edge to edge. */
.tutorial-cta {
  flex: 0 0 auto;
  align-self: center;
  width: auto;
  max-width: 100%;
  margin: 0;
}
</style>
