<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

defineProps<{
  mode: "input" | "streaming" | "result";
  estimatedCost: number;
  hasMessages: boolean;
}>();

const emit = defineEmits<{
  send: [];
  stop: [];
  continue: [];
  download: [];
}>();

const userInput = defineModel<string>("input", { required: true });
const maxCredits = defineModel<number>("maxCredits", { required: true });

const chatInputEl = ref<HTMLTextAreaElement | null>(null);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && e.ctrlKey) {
    e.preventDefault();
    emit("send");
  }
}

function autoGrow() {
  const el = chatInputEl.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
  const rect = el.getBoundingClientRect();
  const vv = window.visualViewport;
  const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  if (rect.bottom > visibleBottom - 8) {
    el.scrollIntoView({ block: "nearest" });
  }
}

function revealChatInput() {
  const el = chatInputEl.value;
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

// Resize to fit whenever the bound value changes — covers draft restore (which
// pre-fills the textarea) and the post-send clear that resets it to one row.
watch(userInput, () => nextTick(autoGrow));

function focus() {
  chatInputEl.value?.focus({ preventScroll: true });
}

defineExpose({ focus, autoGrow, revealChatInput });
</script>

<template>
  <!-- Streaming — centered stop button -->
  <div
    v-if="mode === 'streaming'"
    class="chat-bottom chat-bottom-streaming"
  >
    <button @click="emit('stop')" data-testid="chat-stop">
      <i>stop</i>
      <span>{{ $t("chat.stop") }}</span>
    </button>
  </div>

  <!-- Result — download and continue chat -->
  <div
    v-else-if="mode === 'result'"
    class="chat-bottom chat-bottom-result"
  >
    <button
      class="border"
      @click="emit('download')"
      data-testid="chat-download"
    >
      <i>download</i>
      <span>{{ $t("chat.download") }}</span>
    </button>
    <button @click="emit('continue')" data-testid="chat-continue">
      <i>chat</i>
      <span>{{ $t("chat.continueChat") }}</span>
    </button>
  </div>

  <!-- Input -->
  <div v-else class="chat-bottom">
    <div class="chat-bottom-inner">
      <!-- Input row -->
      <div class="chat-input-row">
        <div class="field border" style="margin: 0; flex: 1; min-width: 0">
          <textarea
            ref="chatInputEl"
            v-model="userInput"
            rows="1"
            :placeholder="$t('chat.inputPlaceholder')"
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
          :title="$t('chat.sendAria')"
          @click="emit('send')"
          data-testid="chat-send"
        >
          <i>send</i>
        </button>
      </div>

      <!-- Cost & limit bar -->
      <div class="chat-cost-bar">
        <span class="cost-label" data-testid="chat-estimate">
          {{ $t("chat.estimatedCost") }} {{ estimatedCost }}
          <span class="coin">🪙</span>
        </span>
        <span class="cost-label">
          {{ $t("chat.limit") }}
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
          v-if="hasMessages"
          class="circle small transparent"
          :title="$t('chat.downloadConvAria')"
          @click="emit('download')"
          data-testid="chat-download-input"
        >
          <i>download</i>
        </button>
      </div>

      <!-- Inline AI disclaimer (#81): the contract-explanation use case sits
           close to legal advice, so the reminder stays visible while typing. -->
      <p class="chat-disclaimer" data-testid="chat-ai-disclaimer">
        {{ $t("chat.aiDisclaimer") }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.chat-input-row .field {
  min-height: 3.25rem;
  border-radius: 0.4rem;
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
  scroll-margin-top: calc(var(--app-bar-clearance) + 0.5rem);
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
.chat-disclaimer {
  margin: 0;
  text-align: center;
  font-size: 0.75rem;
  opacity: 0.6;
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
</style>
