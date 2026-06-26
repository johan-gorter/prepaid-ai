<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessage } from "../../composables/useChat";

const props = defineProps<{
  messages: ChatMessage[];
  streaming: boolean;
  messageCosts: Map<number, number>;
  // The signed-in user's display name (empty when anonymous). Passed in so this
  // component stays presentational and free of the auth composable.
  userName: string;
}>();

const userInitials = computed(() => {
  const name = props.userName || "U";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
});
</script>

<template>
  <div class="chat-messages">
    <div
      v-if="messages.length === 0"
      class="center-align"
      style="padding-top: 3rem; opacity: 0.5"
      data-testid="chat-empty-state"
    >
      <i class="extra" style="font-size: 3rem">chat</i>
      <p>{{ $t("chat.emptyTitle") }}</p>
      <p class="small">{{ $t("chat.emptyHint") }}</p>
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
            msg.role === "user" ? userName || $t("chat.you") : $t("chat.ai")
          }}</span>
        </div>
        <div class="chat-text" style="white-space: pre-wrap">
          {{ msg.text }}
        </div>
        <span
          v-if="streaming && i === messages.length - 1 && msg.role === 'model'"
          class="blinking-cursor"
          >▊</span
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  border-radius: 0.9rem;
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
.blinking-cursor {
  animation: blink 1s step-end infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
