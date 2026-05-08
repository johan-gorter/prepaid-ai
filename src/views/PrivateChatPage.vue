<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppBar from "../components/AppBar.vue";
import { useAuth } from "../composables/useAuth";
import { useBalance } from "../composables/useBalance";
import {
  estimateLocalCredits,
  useChat,
  type ChatMessage,
} from "../composables/useChat";
import { idbGet, idbSet } from "../composables/useIdbStorage";

const router = useRouter();
const { currentUser } = useAuth();
const { balance, waitForLoad: waitForBalance } = useBalance();
const { messages, streaming, estimate, lastCost, error, send, stop } =
  useChat();

const CHAT_DRAFT_KEY = "chatDraft";

interface ChatDraft {
  messages: ChatMessage[];
  input: string;
  maxCredits: number;
}

const userInput = ref("");
const maxCredits = ref(15);
const chatInputEl = ref<HTMLTextAreaElement | null>(null);
const messageCosts = ref<Map<number, number>>(new Map());
// Synchronous re-entry guard for handleSend. We can't rely on
// `streaming.value` because handleSend awaits balance load before flipping
// it — without this flag a fast double-click (or two Ctrl+Enter presses)
// would push two copies of the user message and open two chat streams.
let sendInFlight = false;

const localEstimate = ref(2);
let lastEstimatedLength = 0;

const chatMode = ref<"input" | "streaming" | "result">("input");

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

const userInitials = computed(() => {
  const name = currentUser.value?.displayName || "U";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
});

onMounted(async () => {
  void idbSet("lastPage", "chat");
  const draft = await idbGet<ChatDraft>(CHAT_DRAFT_KEY);
  if (draft && Array.isArray(draft.messages)) {
    // The textarea autofocuses and accepts keystrokes immediately, so the
    // user may have already typed something during the IDB read. Restore
    // each field only if it would not clobber that input.
    if (messages.value.length === 0) {
      messages.value = draft.messages;
    }
    if (!userInput.value) {
      userInput.value = draft.input ?? "";
    }
    if (typeof draft.maxCredits === "number") {
      maxCredits.value = draft.maxCredits;
    }
  }
  if (messages.value.length > 0) {
    localEstimate.value = estimateLocalCredits(messages.value, userInput.value);
    lastEstimatedLength = userInput.value.length;
  }
  await nextTick();
  autoGrow();
});

function scrollToBottom() {
  nextTick(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight });
  });
}

function revealChatInput() {
  const el = chatInputEl.value;
  if (!el) return;
  el.scrollIntoView({ block: "nearest" });
  window.setTimeout(() => el.scrollIntoView({ block: "center" }), 250);
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
    nextTick(() => {
      if (chatInputEl.value) chatInputEl.value.style.height = "auto";
    });
    await send(text, maxCredits.value);
  } finally {
    sendInFlight = false;
  }
}

async function persistChatDraft() {
  const draft: ChatDraft = {
    messages: messages.value,
    input: userInput.value,
    maxCredits: maxCredits.value,
  };
  try {
    await idbSet(CHAT_DRAFT_KEY, draft);
  } catch {
    // ignore: persistence is best-effort
  }
}

// Persist chat state only at meaningful checkpoints. Skipping streaming
// avoids a per-chunk write to IndexedDB (useChat reassigns messages.value[idx]
// per chunk), which would scale O(history²) for long replies.
watch([userInput, maxCredits], () => {
  if (streaming.value) return;
  void persistChatDraft();
});
watch(streaming, (isStreamingNow, wasStreaming) => {
  if (wasStreaming && !isStreamingNow) {
    // Capture the final messages array exactly once when the response ends.
    void persistChatDraft();
  }
});

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && e.ctrlKey) {
    e.preventDefault();
    handleSend();
  }
}

function autoGrow() {
  const el = chatInputEl.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
  el.scrollIntoView({ block: "nearest" });
}

function downloadConversation() {
  const lines = messages.value.map((m) => {
    const role = m.role === "user" ? "You" : "AI";
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
  nextTick(() => chatInputEl.value?.focus());
}
</script>

<template>
  <AppBar title="Chat" />

  <main class="chat-page">
    <!-- Chat messages -->
    <div class="chat-messages">
      <div
        v-if="messages.length === 0"
        class="center-align"
        style="padding-top: 3rem; opacity: 0.5"
        data-testid="chat-empty-state"
      >
        <i class="extra" style="font-size: 3rem">chat</i>
        <p>Start a private conversation with AI.</p>
        <p class="small">Conversations are stored only on this device.</p>
      </div>

      <div v-for="(msg, i) in messages" :key="i" class="chat-message">
        <div
          :class="[
            'chat-bubble',
            msg.role === 'user' ? 'chat-user' : 'chat-model',
          ]"
        >
          <span
            v-if="msg.role === 'model' && messageCosts.has(i)"
            class="chat-cost"
            >🪙 {{ messageCosts.get(i) }}</span
          >
          <div class="chat-role">
            <span v-if="msg.role === 'user'" class="chat-avatar user-avatar">{{
              userInitials
            }}</span>
            <i v-else class="chat-avatar model-avatar">smart_toy</i>
            <span class="bold">{{
              msg.role === "user" ? currentUser?.displayName || "You" : "AI"
            }}</span>
          </div>
          <div class="chat-text" style="white-space: pre-wrap">
            {{ msg.text }}
          </div>
          <span
            v-if="
              streaming && i === messages.length - 1 && msg.role === 'model'
            "
            class="blinking-cursor"
            >▊</span
          >
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="error-bar">
      <i class="small">error</i>
      <span>{{ error }}</span>
    </div>

    <!-- Bottom: streaming — centered stop button -->
    <div
      v-if="chatMode === 'streaming'"
      class="chat-bottom chat-bottom-streaming"
    >
      <button @click="stop" data-testid="chat-stop">
        <i>stop</i>
        <span>Stop</span>
      </button>
    </div>

    <!-- Bottom: result — download and continue chat -->
    <div
      v-else-if="chatMode === 'result'"
      class="chat-bottom chat-bottom-result"
    >
      <button
        class="border"
        @click="downloadConversation"
        data-testid="chat-download"
      >
        <i>download</i>
        <span>Download</span>
      </button>
      <button @click="continueChat" data-testid="chat-continue">
        <i>chat</i>
        <span>Continue Chat</span>
      </button>
    </div>

    <!-- Bottom: input -->
    <div v-else class="chat-bottom">
      <div class="chat-bottom-inner">
        <!-- Input row -->
        <div class="chat-input-row">
          <div
            class="field border round"
            style="margin: 0; flex: 1; min-width: 0"
          >
            <textarea
              ref="chatInputEl"
              v-model="userInput"
              rows="1"
              placeholder="Paste text from documents and type questions"
              autofocus
              @keydown="handleKeydown"
              @focus="revealChatInput"
              @input="autoGrow"
              data-testid="chat-input"
            ></textarea>
          </div>
          <button
            class="circle transparent"
            :disabled="!userInput.trim()"
            title="Send (Ctrl+Enter)"
            @click="handleSend"
            data-testid="chat-send"
          >
            <i>send</i>
          </button>
        </div>

        <!-- Cost & limit bar -->
        <div class="chat-cost-bar">
          <span class="cost-label" data-testid="chat-estimate">
            Estimated cost: {{ estimatedCost }} <span class="coin">🪙</span>
          </span>
          <span class="cost-label">
            Limit:
            <input
              v-model.number="maxCredits"
              type="number"
              min="1"
              class="limit-input"
              data-testid="max-credits"
            />
            <span class="coin">🪙</span>
          </span>
          <button
            v-if="messages.length > 0"
            class="circle small transparent"
            title="Download conversation"
            @click="downloadConversation"
            data-testid="chat-download-input"
          >
            <i>download</i>
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.chat-page {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  /* padding-top clears the fixed AppBar overlay. min-height keeps the composer
     near the viewport bottom on short chats while allowing long chats to grow
     the document and use native page scrolling. */
  padding: var(--app-bar-clearance) 0 0;
  display: flex;
  flex-direction: column;
  min-height: calc(100dvh - var(--kb-inset, 0px));
  overflow: visible;
}
.chat-input-row .field {
  min-height: 3.25rem;
}
.chat-input-row .field textarea {
  font-size: 1.05rem;
  resize: none;
  overflow-y: hidden;
  min-height: 2.5rem;
  line-height: 1.5;
  padding: 0.5rem 0.75rem;
  width: 100%;
  box-sizing: border-box;
  scroll-margin-bottom: calc(var(--kb-inset, 0px) + 6rem);
}
.chat-messages {
  flex: 1;
  overflow: visible;
  padding: 1rem calc(50vw - 400px);
}
@media (max-width: 800px) {
  .chat-messages {
    padding: 1rem 1rem;
  }
}
.chat-message {
  padding: 0.35rem 0;
}
.chat-bubble {
  padding: 0.75rem 1rem;
  border-radius: 1.25rem;
  max-width: 90%;
}
.chat-user {
  background: var(--surface-variant, #e0e0e0);
  margin-left: auto;
}
.chat-model {
  background: var(--secondary-container, #b2dfdb);
}
.chat-role {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
  font-size: 0.9rem;
}
.chat-avatar {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  flex-shrink: 0;
}
.user-avatar {
  background: var(--primary, #6750a4);
  color: var(--on-primary, #fff);
}
.model-avatar {
  font-size: 1.1rem;
  background: var(--secondary, #625b71);
  color: var(--on-secondary, #fff);
}
.chat-text {
  word-break: break-word;
  font-size: 1rem;
  line-height: 1.5;
}
.chat-cost {
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
  font-size: 0.8rem;
  opacity: 0.7;
  white-space: nowrap;
}
.chat-bottom {
  flex-shrink: 0;
  padding: 0.75rem 1rem;
  background: var(--surface-container, #f2ecf1);
  position: relative;
  left: 50%;
  right: 50%;
  margin-left: -50vw;
  margin-right: -50vw;
  width: 100vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  scroll-margin-bottom: calc(var(--kb-inset, 0px) + 1rem);
}
.chat-bottom-streaming {
  justify-content: center;
  min-height: 5rem;
}
.chat-bottom-result {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
}
.chat-bottom-inner {
  width: 100%;
  max-width: 800px;
  padding: 0 1rem;
}
.chat-cost-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.9rem;
}
.cost-label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  opacity: 0.8;
}
.coin {
  font-size: 1.1rem;
}
.limit-input {
  width: 3rem;
  text-align: center;
  border: 1px solid var(--outline, #ccc);
  border-radius: 0.5rem;
  padding: 0.15rem 0.25rem;
  font-size: 0.9rem;
  background: transparent;
  color: inherit;
}
.chat-input-row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
}
.error-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  color: var(--error, #b00020);
  font-size: 0.9rem;
}
.blinking-cursor {
  animation: blink 1s step-end infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
