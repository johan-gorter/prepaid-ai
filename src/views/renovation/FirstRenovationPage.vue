<script setup lang="ts">
import { onMounted } from "vue";
import AppBar from "../../components/AppBar.vue";
import { useImpressionInput } from "../../composables/useImpressionInput";
import { idbSet } from "../../composables/useIdbStorage";
import { updateLastActivity } from "../../composables/useLastActivity";

// First-time, signed-out renovation experience. The signed-in gallery lives at
// /renovations; the home-page CTA routes signed-out visitors here. There is no
// "has seen intro" state — signed-out always means first-time (see #83 and
// docs/viral-flow.md). All three input methods start the wizard without a
// login wall (deferred-auth invariant).
const {
  fileInput,
  pasteError,
  takePhoto,
  onCameraSelected,
  onFileSelected,
  onPasteImage,
} = useImpressionInput();

const steps = [
  { icon: "photo_camera", titleKey: "step1Title", bodyKey: "step1Body" },
  { icon: "draw", titleKey: "step2Title", bodyKey: "step2Body" },
  { icon: "auto_awesome", titleKey: "step3Title", bodyKey: "step3Body" },
] as const;

onMounted(() => {
  // Deliberately not a resume target: a first-timer who relaunches the app
  // should land on the home page, not back here.
  void idbSet("lastPage", "main");
  void updateLastActivity();
});
</script>

<template>
  <AppBar />

  <main
    class="responsive first-renovation"
    style="
      max-width: 640px;
      margin: 0 auto;
      padding: var(--app-bar-clearance) 1rem 2rem;
    "
  >
    <h4 class="no-margin">{{ $t("firstRenovation.title") }}</h4>
    <p class="medium-text intro">{{ $t("firstRenovation.intro") }}</p>

    <!-- One strong example to keep the landing-page promise alive. The asset is
         a diagonal before/after composite, so the split reads as before→after. -->
    <figure class="example no-margin">
      <!-- No Beer CSS sizing class (.round/.small/etc.) here: those set a fixed
           block-size that would override the square aspect-ratio below. -->
      <img
        src="/assets/renovation-small.png"
        :alt="$t('firstRenovation.exampleAlt')"
        class="example-image"
        data-testid="first-renovation-example"
      />
      <figcaption class="small-text secondary-text center-align">
        {{ $t("firstRenovation.exampleCaption") }}
      </figcaption>
    </figure>

    <!-- How it works, in three visual steps. Step 2 sets the expectation that
         the user will mark a region — nobody knows that upfront today. -->
    <section class="how-it-works">
      <h6 class="bold no-margin">{{ $t("firstRenovation.howItWorks") }}</h6>
      <ol class="steps no-margin no-padding">
        <li v-for="step in steps" :key="step.icon" class="step">
          <div class="step-icon primary-container">
            <i aria-hidden="true">{{ step.icon }}</i>
          </div>
          <div class="step-text">
            <p class="bold no-margin">{{ $t(`firstRenovation.${step.titleKey}`) }}</p>
            <p class="small-text secondary-text no-margin">
              {{ $t(`firstRenovation.${step.bodyKey}`) }}
            </p>
          </div>
        </li>
      </ol>
    </section>

    <!-- Button hierarchy: "Take photo" is the single primary action (it fulfils
         the "TRY WITH YOUR PHOTO" CTA); Upload and Paste are secondary. -->
    <nav class="actions" data-testid="first-renovation-actions">
      <button
        class="responsive"
        data-testid="first-renovation-take-photo"
        @click="takePhoto"
      >
        <i aria-hidden="true">photo_camera</i>
        <span>{{ $t("newRenovation.takePhoto") }}</span>
      </button>
      <div class="secondary-actions">
        <button class="border" @click="fileInput?.click()">
          <i aria-hidden="true">upload</i>
          <span>{{ $t("newRenovation.uploadImage") }}</span>
        </button>
        <button
          class="border"
          data-testid="paste-image-btn"
          @click="onPasteImage"
        >
          <i aria-hidden="true">content_paste</i>
          <span>{{ $t("newRenovation.pasteImage") }}</span>
        </button>
      </div>
    </nav>
    <p v-if="pasteError" class="error-text small-text center-align">
      {{ pasteError }}
    </p>

    <!-- Subordinate login hint: this page serves the first-timer, not the
         returning user, so keep it small and below the primary actions. -->
    <nav class="center-align login-hint">
      <router-link
        :to="{ path: '/login', query: { redirect: '/renovations' } }"
        class="transparent button small-round"
        data-testid="first-renovation-sign-in"
      >
        <i aria-hidden="true">login</i>
        <span>{{ $t("firstRenovation.loginHint") }}</span>
      </router-link>
    </nav>

    <!-- Hidden input kept for E2E test compatibility (setInputFiles bypass) -->
    <input
      data-testid="camera-input"
      type="file"
      accept="image/*"
      hidden
      @change="onCameraSelected"
    />
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      hidden
      @change="onFileSelected"
    />
  </main>
</template>

<style scoped>
.intro {
  margin: 0.5rem 0 1.25rem;
}

.example-image {
  display: block;
  width: 100%;
  max-width: 320px;
  height: auto;
  margin: 0 auto;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 0.75rem;
}

.example figcaption {
  margin-top: 0.5rem;
}

.how-it-works {
  margin: 1.75rem 0 2.75rem;
}

.steps {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.step-icon {
  flex: 0 0 auto;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-text {
  min-width: 0;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

/* Beer CSS buttons default to box-sizing: content-box with 1rem inline
   padding, so a width:100% button would overflow the page's 1rem padding and
   read as full-bleed. border-box keeps every action button flush with the body
   text. */
.actions button {
  box-sizing: border-box;
}

.actions > button {
  width: 100%;
}

.secondary-actions {
  display: flex;
  gap: 0.75rem;
}

.secondary-actions button {
  flex: 1 1 0;
  min-width: 0;
}

.login-hint {
  margin-top: 1.5rem;
}

/* The hint can be longer than the viewport on narrow screens, so let it wrap
   onto multiple lines (auto height + normal white-space) and stay within the
   page's 1rem padding instead of overflowing as a single non-wrapping pill. */
.login-hint .button {
  color: var(--primary);
  max-inline-size: 100%;
  block-size: auto;
  min-block-size: 2.5rem;
  padding-block: 0.5rem;
  white-space: normal;
  text-align: center;
}

.login-hint .button span {
  min-width: 0;
}
</style>
