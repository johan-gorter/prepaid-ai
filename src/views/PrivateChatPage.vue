<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import UserMenu from "../components/UserMenu.vue";
import { useAuth } from "../composables/useAuth";
import { useChat } from "../composables/useChat";

const { currentUser } = useAuth();
const { messages, streaming, estimate, lastCost, error, send, stop } =
  useChat();

const userInput = ref("");
const maxCredits = ref(15);
const chatContainer = ref<HTMLElement | null>(null);
const chatInputEl = ref<HTMLInputElement | null>(null);
const messageCosts = ref<Map<number, number>>(new Map());
let lastSendWasTouch = false;

const estimatedCost = computed(() => {
  if (lastCost.value) return lastCost.value.credits;
  if (estimate.value) return estimate.value.estimatedCredits;
  return 5;
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
  const shouldRefocus = !lastSendWasTouch;
  userInput.value = "";
  lastSendWasTouch = false;
  await send(text, maxCredits.value);
  if (shouldRefocus) {
    nextTick(() => chatInputEl.value?.focus());
  }
}

function handleSendTouch() {
  lastSendWasTouch = true;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
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

    <!-- Bottom area -->
    <div class="chat-bottom">
      <div class="chat-bottom-inner">
        <!-- Input row -->
        <div class="chat-input-row">
          <div
            class="field border round"
            style="margin: 0; flex: 1; min-width: 0"
          >
            <input
              ref="chatInputEl"
              v-model="userInput"
              type="text"
              placeholder="Type a message..."
              autofocus
              :disabled="streaming"
              @keydown="handleKeydown"
              data-testid="chat-input"
            />
          </div>
          <button
            v-if="streaming"
            class="circle"
            title="Stop"
            @click="stop"
            data-testid="chat-stop"
          >
            <i>stop</i>
          </button>
          <button
            v-else
            class="circle transparent"
            :disabled="!userInput.trim()"
            title="Send"
            @touchstart="handleSendTouch"
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
              :disabled="streaming"
              data-testid="max-credits"
            />
            <span class="coin">🪙</span>
          </span>
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
  max-width: 700px;
  margin: 0 auto;
  padding: 4.5rem 1rem 0;
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 4.5rem);
  overflow: visible;
}
.chat-input-row .field {
  min-height: 3.25rem;
}
.chat-input-row .field input {
  height: 3.25rem;
  font-size: 1.05rem;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 0;
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
  align-items: center;
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
