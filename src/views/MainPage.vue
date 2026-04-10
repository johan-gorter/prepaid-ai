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
  localStorage.setItem("prepaid-ai-last-page", "main");
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
  <header class="fixed primary">
    <nav>
      <h1 class="max">Prepaid AI</h1>
      <UserMenu />
    </nav>
  </header>

  <main
    class="responsive"
    style="max-width: 700px; margin: 0 auto; padding-top: 4.5rem"
  >
    <p>
      Prepaid AI gives you access to premium AI applications
      <strong>without any ongoing subscription</strong>. We are a friendly and
      fair platform allowing everyone to benefit from AI.
    </p>

    <h5>AI Impressions for your renovations</h5>

    <p>
      Reimagine your living spaces with AI-powered renovation visualizations.
      Upload a photo, mark the area you want to change, describe your vision,
      and see it come to life.
    </p>
    <router-link to="/renovations">Start</router-link>

    <h5>Private Chat</h5>
    <p>
      Have a private conversation with a powerful AI model. For example, you can
      use this to explain technical, legal or medical documents. Your chat stays
      on your device only.
    </p>
    <router-link to="/chat">Start</router-link>.

    <p>
      Check your
      <router-link to="/balance">Balance</router-link> to see your current
      credits, or read our
      <router-link to="/about">About &amp; Legal</router-link>
      page for usage terms and policies.
    </p>

    <h5>We'd love your feedback</h5>
    <p>
      What features would you like to see next? Let us know what you'd find most
      useful.
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
        ></textarea>
      </div>
      <button
        class="small-margin"
        :disabled="!feedbackMessage.trim() || feedbackSending"
        @click="submitFeedback"
        data-testid="feedback-submit"
      >
        <i>send</i>
        <span>Send feedback</span>
      </button>
    </div>
  </main>
</template>
