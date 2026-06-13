<script setup lang="ts">
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "../composables/useAuth";
import { idbDelete, idbGet, idbSet } from "../composables/useIdbStorage";
import { db } from "../firebase";

// Single string key in the unified IndexedDB store (see useIdbStorage). The
// value is the trimmed draft message — a plain JSON-serialisable string.
const FEEDBACK_DRAFT_KEY = "feedbackDraft";

const { currentUser } = useAuth();
const router = useRouter();

const feedbackMessage = ref("");
const feedbackSending = ref(false);
const feedbackSent = ref(false);

onMounted(async () => {
  const draft = await idbGet<string>(FEEDBACK_DRAFT_KEY);
  // Restore only if the user hasn't already started typing during the IDB
  // read — otherwise we'd clobber fresh keystrokes with the stored draft.
  if (draft && !feedbackMessage.value) {
    feedbackMessage.value = draft;
  }
});

// Persist on every change so the draft always survives — not just the sign-in
// detour, but also a background service-worker refresh or the browser
// reclaiming memory. Clear the key once the field is empty again.
watch(feedbackMessage, (msg) => {
  if (msg.trim()) {
    void idbSet(FEEDBACK_DRAFT_KEY, msg);
  } else {
    void idbDelete(FEEDBACK_DRAFT_KEY);
  }
});

async function submitFeedback() {
  const message = feedbackMessage.value.trim();
  if (!message || feedbackSending.value) return;

  const uid = currentUser.value?.uid;
  if (!uid) {
    // Signed-out: the watch above has already persisted the draft, but write
    // it once more synchronously so the redirect can't outrace the debounced
    // store. Send the visitor to login and bring them back to the main page,
    // where onMounted restores the draft so they can press send again.
    await idbSet(FEEDBACK_DRAFT_KEY, message);
    void router.push({ path: "/login", query: { redirect: "/" } });
    return;
  }

  feedbackSending.value = true;
  try {
    await addDoc(collection(db, "feedback"), {
      uid,
      message,
      createdAt: serverTimestamp(),
    });
    feedbackMessage.value = "";
    await idbDelete(FEEDBACK_DRAFT_KEY);
    feedbackSent.value = true;
  } finally {
    feedbackSending.value = false;
  }
}
</script>

<template>
  <article class="border medium-text" style="margin-top: 1.5rem">
    <h6 class="bold">{{ $t("main.shareYourThoughts") }}</h6>
    <p>
      {{ $t("main.feedbackWhichToolMissing") }}
    </p>
    <div v-if="feedbackSent" class="medium-padding">
      <p><i class="small">check_circle</i> {{ $t("main.thanksForFeedback") }}</p>
    </div>
    <div v-else>
      <div class="field textarea border">
        <textarea
          v-model="feedbackMessage"
          :placeholder="$t('main.tellUsAboutYourIdea')"
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
        <span>{{ $t("main.shareYourIdea") }}</span>
      </button>
    </div>
  </article>
</template>

<style scoped>
/* Constrain the call-to-action button and center it within the card.
   Beer CSS buttons are inline-flex, so margin:auto alone won't center them —
   force block-level layout. */
.card-cta {
  display: flex;
  max-width: 360px;
  margin-left: auto;
  margin-right: auto;
}
</style>
