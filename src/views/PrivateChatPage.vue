<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import AppBar from "../components/AppBar.vue";
import ChatComposer from "../components/chat/ChatComposer.vue";
import ChatMessageList from "../components/chat/ChatMessageList.vue";
import { useAuth } from "../composables/useAuth";
import { useBalance } from "../composables/useBalance";
import { estimateLocalCredits, useChat } from "../composables/useChat";
import { useChatDraft } from "../composables/useChatDraft";
import { idbSet } from "../composables/useIdbStorage";

const { t } = useI18n();
const router = useRouter();
const { currentUser } = useAuth();
const { balance, waitForLoad: waitForBalance } = useBalance();
const { messages, streaming, estimate, lastCost, error, send, stop } =
  useChat();

const userInput = ref("");
const maxCredits = ref(15);
const composerRef = ref<InstanceType<typeof ChatComposer> | null>(null);
const messageCosts = ref<Map<number, number>>(new Map());
// Synchronous re-entry guard for handleSend. We can't rely on
// `streaming.value` because handleSend awaits balance load before flipping
// it — without this flag a fast double-click (or two Ctrl+Enter presses)
// would push two copies of the user message and open two chat streams.
let sendInFlight = false;

const localEstimate = ref(2);
let lastEstimatedLength = 0;

const chatMode = ref<"input" | "streaming" | "result">("input");

const { persist: persistChatDraft, restore: restoreChatDraft } = useChatDraft({
  messages,
  input: userInput,
  maxCredits,
  streaming,
});

const userName = computed(() => currentUser.value?.displayName ?? "");

const estimatedCost = computed(() => {
  if (lastCost.value) return lastCost.value.credits;
  if (estimate.value) return estimate.value.estimatedCredits;
  return localEstimate.value;
});

watch(userInput, (newVal) => {
  if (newVal.length === 0) {
    lastEstimatedLength = 0;
    return;
  }
  if (Math.abs(newVal.length - lastEstimatedLength) >= 200) {
    localEstimate.value = estimateLocalCredits(messages.value, newVal);
    lastEstimatedLength = newVal.length;
  }
});

watch(streaming, (isStreaming) => {
  if (!isStreaming && chatMode.value === "streaming") {
    chatMode.value = error.value ? "input" : "result";
  }
});

// Track cost per model message when streaming finishes
watch(lastCost, (cost) => {
  if (cost) {
    const lastModelIdx = messages.value.length - 1;
    if (messages.value[lastModelIdx]?.role === "model") {
      messageCosts.value.set(lastModelIdx, cost.credits);
    }
  }
});

onMounted(async () => {
  void idbSet("lastPage", "chat");
  await nextTick();
  composerRef.value?.focus();
  await restoreChatDraft();
  if (messages.value.length > 0) {
    localEstimate.value = estimateLocalCredits(messages.value, userInput.value);
    lastEstimatedLength = userInput.value.length;
  }
  await nextTick();
  composerRef.value?.autoGrow();
  composerRef.value?.revealChatInput();
});

function scrollToBottom() {
  nextTick(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight });
  });
}

watch(
  () => messages.value.length,
  () => scrollToBottom(),
);
watch(
  () => messages.value[messages.value.length - 1]?.text,
  () => scrollToBottom(),
);

async function handleSend() {
  // Synchronous guard — must come before any await so a double-click can't
  // get two invocations through to the network.
  if (sendInFlight) return;
  const text = userInput.value.trim();
  if (!text || streaming.value) return;
  sendInFlight = true;
  try {
    const minCost = estimateLocalCredits(messages.value, text);
    // Make sure we know the user's actual balance before deciding whether
    // to redirect to /buy-credits — otherwise the initial Firestore snapshot
    // race would bounce a user with funds straight to the purchase page.
    if (currentUser.value) await waitForBalance();
    if (!currentUser.value || balance.value < minCost) {
      // Persist the draft so the conversation + typed input survive the
      // sign-in / buy-credits detour.
      await persistChatDraft();
      router.push({
        path: "/buy-credits",
        query: {
          min: String(minCost),
          max: String(maxCredits.value),
          redirect: "/chat",
        },
      });
      return;
    }
    userInput.value = "";
    lastEstimatedLength = 0;
    chatMode.value = "streaming";
    await send(text, maxCredits.value);
  } finally {
    sendInFlight = false;
  }
}

function downloadConversation() {
  const lines = messages.value.map((m) => {
    const role = m.role === "user" ? t("chat.you") : t("chat.ai");
    return `${role}:\n${m.text}`;
  });
  const content = lines.join("\n\n");
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chat.txt";
  a.click();
  URL.revokeObjectURL(url);
}

function continueChat() {
  chatMode.value = "input";
  localEstimate.value = estimateLocalCredits(messages.value, userInput.value);
  lastEstimatedLength = userInput.value.length;
  nextTick(() => composerRef.value?.focus());
}
</script>

<template>
  <AppBar />

  <main class="chat-page">
    <ChatMessageList
      :messages="messages"
      :streaming="streaming"
      :message-costs="messageCosts"
      :user-name="userName"
    />

    <!-- Error -->
    <div v-if="error" class="error-bar">
      <i class="small">error</i>
      <span>{{ error }}</span>
    </div>

    <ChatComposer
      ref="composerRef"
      v-model:input="userInput"
      v-model:max-credits="maxCredits"
      :mode="chatMode"
      :estimated-cost="estimatedCost"
      :has-messages="messages.length > 0"
      @send="handleSend"
      @stop="stop"
      @continue="continueChat"
      @download="downloadConversation"
    />
  </main>
</template>

<style scoped>
.chat-page {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  /* padding-top clears the fixed AppBar overlay. Keyboard compensation is
      additive padding on #app, so short chats gain scroll runway instead of
      shrinking when the on-screen keyboard opens. */
  padding: var(--app-bar-clearance) 0 0;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  overflow: visible;
}
.error-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  color: var(--error, #b00020);
  font-size: 0.9rem;
}
</style>
