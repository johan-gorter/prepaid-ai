<script setup lang="ts">
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { onMounted, ref } from "vue";
import UserMenu from "../components/UserMenu.vue";
import { useAuth } from "../composables/useAuth";
import { updateLastActivity } from "../composables/useLastActivity";
import { db } from "../firebase";

const { currentUser } = useAuth();
const feedbackMessage = ref("");
const feedbackSending = ref(false);
const feedbackSent = ref(false);

onMounted(() => {
  localStorage.setItem("payasyougo-last-page", "main");
  updateLastActivity();
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
  <header class="fixed">
    <nav>
      <h6 class="max">payasyougo.app</h6>
      <UserMenu />
    </nav>
  </header>

  <main
    class="responsive"
    style="
      max-width: 800px;
      margin: 0 auto;
      padding-top: 1.25rem;
      padding-bottom: 2rem;
    "
  >
    <p>
      Hello, here you can benefit from premium AI applications
      <strong>without any ongoing subscription</strong>. We are a friendly and
      fair platform allowing everyone to benefit from AI.
    </p>

    <!-- AI Impressions card -->
    <article class="round small-elevate">
      <nav style="align-items: start">
        <img
          src="/assets/renovation-small.png"
          alt="Renovation preview"
          class="round"
          style="width: 96px; height: 96px; object-fit: cover"
        />
        <div class="max">
          <h5>AI Impressions for renovations</h5>
          <p>
            Reimagine your living spaces with AI-generated artist impressions.
            Upload a photo, mark the area you want to change, describe your
            vision, and see it come to life.
          </p>
        </div>
      </nav>
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
    <article class="round small-elevate" style="margin-top: 1rem">
      <nav style="align-items: start">
        <i class="extra primary-text">verified_user</i>
        <div class="max">
          <h5>Private Chat</h5>
          <p>
            Have a private conversation with a powerful AI model (Gemini Pro).
            For example, you can use this to explain technical, legal or medical
            documents.
          </p>
        </div>
      </nav>
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
      class="round border"
      style="margin-top: 1.5rem; border-left: 4px solid var(--amber)"
    >
      <h5><strong>We'd love your feedback.</strong></h5>
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
