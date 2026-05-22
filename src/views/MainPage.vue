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
      Hello, here you can benefit from premium AI applications
      <strong>without any ongoing subscription</strong>. We are a friendly and
      fair platform allowing everyone to benefit from AI.
    </p>

    <!-- AI Impressions card -->
    <article class="small-elevate border medium-text">
      <div class="card-media">
        <img
          src="/assets/renovation-small.png"
          alt="Renovation preview"
          class="round card-thumb"
        />
        <h6 class="bold no-margin card-title">AI Impressions for renovations</h6>
        <p class="card-desc">
          Reimagine your living spaces with AI-generated artist impressions.
        </p>
      </div>
      <router-link
        to="/renovations"
        class="button responsive small-round"
        style="margin-top: 4px"
      >
        <span>VISUALIZE NOW</span>
        <i>photo_camera</i>
      </router-link>
    </article>

    <!-- Private Chat card -->
    <article class="small-elevate border medium-text" style="margin-top: 1rem">
      <div class="card-media">
        <i class="extra primary-text">verified_user</i>
        <h6 class="bold no-margin card-title">Private Chat</h6>
        <p class="card-desc">
          Have a private conversation with a powerful AI model (Gemini Pro).
          For example, you can use this to explain technical, legal or medical
          documents.
        </p>
      </div>
      <router-link to="/chat" class="button responsive small-round amber">
        <span>CHAT SECURELY</span>
        <i>public</i>
      </router-link>
    </article>

    <!-- Credits & Terms -->
    <nav class="center-align" style="margin-top: 1.5rem">
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
    <article
      class="border medium-text"
      style="margin-top: 1.5rem; border-left: 4px solid var(--amber)"
    >
      <h6 class="bold no-margin">We'd love your feedback.</h6>
      <p>
        What features would you like to see next? Let us know what you'd find
        most useful.
      </p>
      <div v-if="feedbackSent" class="medium-padding">
        <p><i class="small">check_circle</i> Thanks for your feedback!</p>
      </div>
      <div v-else>
        <div class="field textarea border round">
          <textarea
            v-model="feedbackMessage"
            placeholder="Tell us what you'd like to see..."
            rows="3"
            data-testid="feedback-input"
            style="
              border-radius: 12px;
              background-color: var(--surface-container-lowest);
            "
          ></textarea>
        </div>
        <button
          :disabled="!feedbackMessage.trim() || feedbackSending"
          @click="submitFeedback"
          data-testid="feedback-submit"
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
