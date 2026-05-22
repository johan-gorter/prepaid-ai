<script setup lang="ts">
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { onMounted, ref } from "vue";
import AppBar from "../components/AppBar.vue";
import { useAuth } from "../composables/useAuth";
import { idbSet } from "../composables/useIdbStorage";
import { updateLastActivity } from "../composables/useLastActivity";
import { db } from "../firebase";

const { currentUser } = useAuth();
const feedbackMessage = ref("");
const feedbackSending = ref(false);
const feedbackSent = ref(false);

onMounted(() => {
  void idbSet("lastPage", "main");
  void updateLastActivity();
});

async function submitFeedback() {
  const uid = currentUser.value?.uid;
  if (!uid || !feedbackMessage.value.trim()) return;

  feedbackSending.value = true;
  try {
    await addDoc(collection(db, "feedback"), {
      uid,
      message: feedbackMessage.value.trim(),
      createdAt: serverTimestamp(),
    });
    feedbackMessage.value = "";
    feedbackSent.value = true;
  } finally {
    feedbackSending.value = false;
  }
}
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
    <p>
      Use the best AI tools
      <strong class="primary-text">without a monthly fee</strong>. Pay only for
      what you use.
    </p>

    <!-- AI Impressions card -->
    <article class="border medium-text" data-testid="renovations-card">
      <div class="card-media">
        <img
          src="/assets/renovation-small.png"
          alt="Renovation preview"
          class="round card-thumb"
        />
        <h6 class="bold no-margin card-title" data-testid="renovations-card-heading">AI Renovation Previews</h6>
        <p class="card-desc">
          Imagine your rooms and exterior with AI-generated artist impressions.
        </p>
      </div>
      <router-link
        to="/renovations"
        class="button responsive small-round card-cta"
        style="margin-top: 4px"
      >
        <span>VISUALIZE NOW</span>
        <i>photo_camera</i>
      </router-link>
    </article>

    <!-- Private Chat card -->
    <article class="border medium-text" style="margin-top: 1rem">
      <div class="card-media">
        <i class="extra primary-text">verified_user</i>
        <h6 class="bold no-margin card-title">Private Chat</h6>
        <p class="card-desc">
          Chat privately with a powerful AI. Great for explaining legal,
          medical, or technical documents.
        </p>
      </div>
      <router-link to="/chat" class="button responsive small-round card-cta">
        <span>CHAT SECURELY</span>
        <i>public</i>
      </router-link>
    </article>

    <!-- Credits & Terms -->
    <nav class="center-align wrap" style="margin-top: 1.5rem">
      <router-link to="/balance" class="transparent button small-round">
        <i>savings</i>
        <span>Check Credits</span>
      </router-link>
      <router-link to="/about" class="transparent button small-round">
        <i>gavel</i>
        <span>View Usage Terms</span>
      </router-link>
    </nav>

    <!-- Feedback card -->
    <article class="border medium-text" style="margin-top: 1.5rem">
      <h6 class="bold">We'd love your feedback.</h6>
      <p>
        What features would you like to see next? Let us know what you'd find
        most useful.
      </p>
      <div v-if="feedbackSent" class="medium-padding">
        <p><i class="small">check_circle</i> Thanks for your feedback!</p>
      </div>
      <div v-else>
        <div class="field textarea border">
          <textarea
            v-model="feedbackMessage"
            placeholder="Tell us what you'd like to see..."
            rows="3"
            data-testid="feedback-input"
            style="background-color: var(--surface-container-lowest)"
          ></textarea>
        </div>
        <button
          :disabled="!feedbackMessage.trim() || feedbackSending"
          @click="submitFeedback"
          data-testid="feedback-submit"
          class="responsive small-round card-cta"
          style="margin-top: 8px"
        >
          <i>send</i>
          <span>SEND FEEDBACK</span>
        </button>
      </div>
    </article>
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
