<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import AppBar from "../components/AppBar.vue";
import FeedbackCard from "../components/FeedbackCard.vue";
import { useAuth } from "../composables/useAuth";
import { idbSet } from "../composables/useIdbStorage";
import { updateLastActivity } from "../composables/useLastActivity";
import { track } from "../composables/useTrack";

const { currentUser } = useAuth();
const router = useRouter();

// Signed-in visitors go to their gallery; signed-out first-timers get the
// first-renovation walkthrough (see #83). The signed-in label/target pairing
// keeps the CTA honest about where it leads.
const renovationsTarget = computed(() =>
  currentUser.value ? "/renovations" : "/first-renovation",
);

// The whole card is a tap target, but the CTA link inside stays the real
// (focusable, announced) link — skip when the click already came from it.
function openCard(event: MouseEvent, to: string) {
  if ((event.target as HTMLElement).closest("a")) return;
  void router.push(to);
}

// Renovation card: the top of the viral funnel. Count the entry click here
// (cta_click) for both the card body and its CTA link, then navigate. The
// link's own @click handles the link case; this body handler bails when the
// click came from the link so the step is counted exactly once.
function openRenovations(event: MouseEvent) {
  if ((event.target as HTMLElement).closest("a")) return;
  track("cta_click");
  void router.push(renovationsTarget.value);
}

onMounted(() => {
  void idbSet("lastPage", "main");
  void updateLastActivity();
  track("landing_view");
});
</script>

<template>
  <AppBar />

  <main
    class="responsive"
    style="
      max-width: 800px;
      margin: 0 auto;
      padding-top: var(--app-bar-clearance);
      padding-bottom: 2rem;
    "
  >
    <i18n-t keypath="main.taglinePayPerUse" tag="p" class="large-text">
      <template #highlight>
        <strong class="primary-text">{{
          $t("main.withoutMonthlySubscription")
        }}</strong>
      </template>
    </i18n-t>

    <!-- AI Impressions card -->
    <article
      class="border medium-text tappable"
      data-testid="renovations-card"
      @click="openRenovations($event)"
    >
      <div class="card-media">
        <img
          src="/assets/renovation-small.png"
          :alt="$t('main.renovationPreviewAlt')"
          class="round card-thumb"
        />
        <h6
          class="bold no-margin card-title"
          data-testid="renovations-card-heading"
        >
          {{ $t("main.sketchYourRenovation") }}
        </h6>
        <p class="card-desc">
          {{ $t("main.renovationResultInSeconds") }}
        </p>
      </div>
      <router-link
        :to="renovationsTarget"
        class="button responsive small-round card-cta"
        style="margin-top: 4px"
        @click="track('cta_click')"
      >
        <span>{{
          currentUser ? $t("main.yourRenovations") : $t("main.testYourIdea")
        }}</span>
        <i>photo_camera</i>
      </router-link>
    </article>

    <!-- Private Chat card -->
    <article
      class="border medium-text tappable"
      style="margin-top: 1rem"
      @click="openCard($event, '/chat')"
    >
      <div class="card-media">
        <i class="extra primary-text">verified_user</i>
        <h6 class="bold no-margin card-title">{{ $t("main.securePrivateChat") }}</h6>
        <p class="card-desc">
          {{ $t("main.chatExplainInPlainLanguage") }}
        </p>
      </div>
      <router-link to="/chat" class="button responsive small-round card-cta">
        <span>{{ $t("main.startChatting") }}</span>
        <i>public</i>
      </router-link>
    </article>

    <!-- Credits & Terms -->
    <nav class="center-align wrap" style="margin-top: 1.5rem">
      <router-link to="/balance" class="transparent button small-round">
        <i>savings</i>
        <span>{{ $t("main.checkCredits") }}</span>
      </router-link>
      <router-link to="/about" class="transparent button small-round">
        <i>gavel</i>
        <span>{{ $t("main.viewUsageTerms") }}</span>
      </router-link>
    </nav>

    <!-- Feedback card -->
    <FeedbackCard />
  </main>
</template>

<style scoped>
/* Media card layout: thumbnail/icon in column 1, heading beside it, paragraph
   beside it too. The image spans both rows so heading + paragraph sit to its
   right (matches the wider-viewport design). */
.card-media {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 1rem;
  row-gap: 0.25rem;
  align-items: start;
  grid-template-areas:
    "media title"
    "media desc";
}

.card-media > :first-child {
  grid-area: media;
}

.card-media > .card-title {
  grid-area: title;
}

.card-media > .card-desc {
  grid-area: desc;
}

.card-media > img.card-thumb {
  width: 96px;
  height: 96px;
  object-fit: cover;
}

/* Constrain the call-to-action buttons and center them within the card.
   Beer CSS buttons are inline-flex, so margin:auto alone won't center them —
   force block-level layout. */
.card-cta {
  display: flex;
  max-width: 360px;
  margin-left: auto;
  margin-right: auto;
}

/* The whole card is clickable (see openCard); the CTA link inside remains the
   real focusable link. A CSS stretched-link overlay doesn't work here: Beer CSS
   already uses the button's ::before/::after for hover and ripple effects. */
.tappable {
  cursor: pointer;
}

/* Below 360px the side-by-side text column gets too narrow and the cards grow
   very tall. Shrink the thumbnail and drop the paragraph to a full-width row
   under the image, keeping only the heading beside the image. */
@media (max-width: 359px) {
  .card-media {
    grid-template-areas:
      "media title"
      "desc desc";
  }

  .card-media > img.card-thumb {
    width: 64px;
    height: 64px;
  }
}
</style>
