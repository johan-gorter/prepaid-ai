<script setup lang="ts">
/**
 * Tutorial that explains how to bring an image in from the web: long-press an
 * image on another site, copy it, then paste it back into payasyougo.app. The
 * three illustrated steps come from the designer (src/assets/tutorial). The CTA
 * opens a fresh, empty browser tab so the user can go hunt for an image, then
 * returns to this tab to paste via the existing "Paste image" action.
 */
import step1 from "../assets/tutorial/step1.png";
import step2 from "../assets/tutorial/step2.png";
import step3 from "../assets/tutorial/step3.png";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

function onGetIt() {
  // A blank, clean tab to go find an image on the web. Opened from a click
  // (user gesture) so the browser doesn't treat it as a blocked popup.
  window.open("about:blank", "_blank", "noopener");
  emit("close");
}
</script>

<template>
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
      class="tutorial-cta"
      data-testid="internet-tutorial-cta"
      @click="onGetIt"
    >
      <span>{{ $t("internetTutorial.cta") }}</span>
    </button>
  </dialog>
</template>

<style scoped>
/* Fits from 300px-wide phones up; widens and lays the steps out in a row on
   bigger screens (see the min-width query below). */
.tutorial-dialog {
  width: min(92vw, 30rem);
  max-width: 92vw;
  max-height: 90vh;
  padding: 1rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow: hidden;
}

.tutorial-head {
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

.tutorial-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
}

/* Phone layout: thumbnail on the left, label on the right. */
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

.tutorial-cta {
  width: 100%;
  margin: 0;
}

/* Roomier screens: widen the dialog and stand the three steps side by side
   with the thumbnail above its label. */
@media (min-width: 560px) {
  .tutorial-dialog {
    width: min(92vw, 44rem);
    gap: 1rem;
  }

  .tutorial-steps {
    flex-direction: row;
    gap: 1rem;
  }

  .tutorial-step {
    flex: 1 1 0;
    flex-direction: column;
    align-items: stretch;
    text-align: center;
    gap: 0.5rem;
  }

  .tutorial-img {
    width: 100%;
  }
}
</style>
