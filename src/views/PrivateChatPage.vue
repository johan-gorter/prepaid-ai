<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import UserMenu from "../components/UserMenu.vue";
import { useAuth } from "../composables/useAuth";
import { estimateLocalCredits, useChat } from "../composables/useChat";

const { currentUser } = useAuth();
const { messages, streaming, estimate, lastCost, error, send, stop } =
  useChat();

const userInput = ref("");
const maxCredits = ref(15);
const chatContainer = ref<HTMLElement | null>(null);
const chatInputEl = ref<HTMLTextAreaElement | null>(null);
const messageCosts = ref<Map<number, number>>(new Map());

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

onMounted(() => {
  localStorage.setItem("prepaid-ai-last-page", "chat");
  if (messages.value.length > 0) {
    localEstimate.value = estimateLocalCredits(messages.value, userInput.value);
    lastEstimatedLength = userInput.value.length;
  }
});

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
    }
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
  const text = userInput.value.trim();
  if (!text || streaming.value) return;
  userInput.value = "";
  lastEstimatedLength = 0;
  chatMode.value = "streaming";
  nextTick(() => {
    if (chatInputEl.value) chatInputEl.value.style.height = "auto";
  });
  await send(text, maxCredits.value);
}

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
}

function downloadConversation() {
  const lines = messages.value.map((m) => {
    const role = m.role === "user" ? "You" : "Gemini";
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
  <header class="fixed primary">
    <nav>
      <router-link to="/main" class="breadcrumb-root">Prepaid AI</router-link>
      <span class="breadcrumb-sep">&gt;</span>
      <h6 class="max">Chat</h6>
      <UserMenu />
    </nav>
  </header>

  <main class="chat-page">
    <!-- Chat messages -->
    <div ref="chatContainer" class="chat-messages">
      <div
        v-if="messages.length === 0"
        class="center-align"
        style="padding-top: 3rem; opacity: 0.5"
      >
        <i class="extra" style="font-size: 3rem">chat</i>
        <p>Start a private conversation with Gemini Pro.</p>
        <p class="small">No conversation data is stored.</p>
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
              msg.role === "user" ? currentUser?.displayName || "You" : "Gemini"
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
.breadcrumb-root {
  text-decoration: underline;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 1.25rem;
  font-weight: 500;
  color: inherit;
  min-width: 0;
}
.breadcrumb-sep {
  margin: 0 0.25rem;
  flex-shrink: 0;
}
.chat-page {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding: 4.5rem 0 0;
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 4.5rem);
  overflow: visible;
}
.chat-input-row .field {
  min-height: 3.25rem;
}
.chat-input-row .field textarea {
  font-size: 1.05rem;
  resize: none;
  overflow-y: auto;
  min-height: 2.5rem;
  max-height: calc(1.5em * 5 + 1rem);
  line-height: 1.5;
  padding: 0.5rem 0.75rem;
  width: 100%;
  box-sizing: border-box;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem calc(50vw - 350px);
}
@media (max-width: 700px) {
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
  max-width: 700px;
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
