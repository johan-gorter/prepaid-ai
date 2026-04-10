<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import UserMenu from "../components/UserMenu.vue";
import { useAuth } from "../composables/useAuth";
import { useBalance } from "../composables/useBalance";
import { useChat } from "../composables/useChat";

const { currentUser } = useAuth();
const { balance } = useBalance();
const { messages, streaming, estimate, lastCost, error, send, stop, clear } =
  useChat();

const userInput = ref("");
const maxCredits = ref(10);
const chatContainer = ref<HTMLElement | null>(null);

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
  userInput.value = "";
  await send(text, maxCredits.value);
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
      <h5 class="max">Private Chat</h5>
      <UserMenu />
    </nav>
  </header>

  <main
    class="responsive"
    style="
      max-width: 700px;
      margin: 0 auto;
      padding-top: 4.5rem;
      display: flex;
      flex-direction: column;
      height: calc(100dvh - 4.5rem);
    "
  >
    <!-- Chat messages -->
    <div ref="chatContainer" style="flex: 1; overflow-y: auto; padding: 1rem 0">
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
          <div class="chat-role">
            <i class="small">{{
              msg.role === "user" ? "person" : "smart_toy"
            }}</i>
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

      <!-- Cost info -->
      <div
        v-if="lastCost"
        class="small"
        style="padding: 0.5rem; opacity: 0.6; text-align: center"
      >
        Cost: {{ lastCost.credits }} credit{{
          lastCost.credits !== 1 ? "s" : ""
        }}
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="error-bar">
      <i class="small">error</i>
      <span>{{ error }}</span>
    </div>

    <!-- Estimate bar -->
    <div v-if="estimate && streaming" class="estimate-bar">
      <i class="small">info</i>
      <span
        >Estimated max: {{ estimate.estimatedCredits }} credit{{
          estimate.estimatedCredits !== 1 ? "s" : ""
        }}</span
      >
    </div>

    <!-- Input area -->
    <div style="padding: 0.5rem 0; flex-shrink: 0">
      <div class="chat-controls">
        <div class="field small" style="width: 6rem; flex-shrink: 0">
          <input
            v-model.number="maxCredits"
            type="number"
            min="1"
            :disabled="streaming"
            data-testid="max-credits"
          />
          <span class="helper">Max credits</span>
        </div>
        <span class="small" style="opacity: 0.6" data-testid="chat-balance"
          >Balance: {{ balance }} credits</span
        >
        <span class="max"></span>
        <button
          v-if="messages.length > 0 && !streaming"
          class="circle transparent small"
          title="Clear chat"
          @click="clear"
          data-testid="chat-clear"
        >
          <i>delete</i>
        </button>
      </div>
      <div class="chat-input-row">
        <div class="field textarea border max">
          <textarea
            v-model="userInput"
            placeholder="Type a message…"
            rows="2"
            :disabled="streaming"
            @keydown="handleKeydown"
            data-testid="chat-input"
          ></textarea>
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
          class="circle"
          :disabled="!userInput.trim()"
          title="Send"
          @click="handleSend"
          data-testid="chat-send"
        >
          <i>send</i>
        </button>
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
.chat-message {
  padding: 0.25rem 0;
}
.chat-bubble {
  padding: 0.75rem 1rem;
  border-radius: 1rem;
  max-width: 90%;
}
.chat-user {
  background: var(--surface-variant, #e8e0f0);
  margin-left: auto;
}
.chat-model {
  background: var(--surface, #f5f5f5);
}
.chat-role {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.25rem;
  font-size: 0.85rem;
  opacity: 0.7;
}
.chat-text {
  word-break: break-word;
}
.chat-input-row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
}
.chat-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.25rem;
}
.estimate-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.85rem;
  opacity: 0.7;
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
@media (max-width: 360px) {
  .breadcrumb-root {
    max-width: 5rem;
  }
}
</style>
