<script setup lang="ts">
/**
 * Prompt stage: the free-prompt textarea plus the Back | Generate footer.
 * Owns the grow-to-fit + reveal-above-keyboard logic so the page no longer
 * needs a stage watcher for focus management. The collapsed canvas floats
 * above this textarea via CSS owned by the page.
 */
import { onMounted, ref } from "vue";
import StickyFooter from "../../../components/StickyFooter.vue";

const prompt = defineModel<string>({ required: true });

defineProps<{ canGenerate: boolean }>();

defineEmits<{
  back: [];
  generate: [];
}>();

const promptInputRef = ref<HTMLTextAreaElement | null>(null);

function growPromptInput() {
  const el = promptInputRef.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function revealPromptInput() {
  const el = promptInputRef.value;
  if (!el) return;
  el.scrollIntoView({ block: "nearest" });
  // VisualViewport resize can land after focus on mobile, especially iOS.
  window.setTimeout(() => el.scrollIntoView({ block: "center" }), 250);
}

onMounted(() => {
  const el = promptInputRef.value;
  if (!el) return;
  growPromptInput();
  el.focus();
  revealPromptInput();
});
</script>

<template>
  <div class="prompt-flex">
    <div class="field textarea label border round prompt-field">
      <textarea
        id="prompt-input"
        ref="promptInputRef"
        data-testid="prompt"
        v-model="prompt"
        placeholder=" "
        @focus="revealPromptInput"
        @input="growPromptInput"
      ></textarea>
      <label for="prompt-input">{{ $t("newImpression.promptLabel") }}</label>
    </div>
  </div>

  <!-- Prompt stage footer: Back | Generate -->
  <StickyFooter>
    <button class="max border small-round" @click="$emit('back')">
      <i aria-hidden="true">arrow_back</i>
      <span>{{ $t("newImpression.back") }}</span>
    </button>
    <div class="small-space"></div>
    <button
      class="max small-round"
      :disabled="!canGenerate"
      @click="$emit('generate')"
    >
      <i aria-hidden="true">auto_awesome</i>
      <span>{{ $t("newImpression.generate") }}</span>
    </button>
  </StickyFooter>
</template>

<style scoped>
.prompt-flex {
  padding: 0.5rem;
  width: 100%;
  max-width: 544px;
  margin: 0 auto;
  scroll-margin-bottom: calc(var(--kb-inset, 0px) + 6rem);
}

.prompt-field {
  width: 100%;
  background: var(--surface, #fff);
}

.prompt-field textarea {
  min-height: clamp(
    14rem,
    calc(100dvh - var(--app-bar-clearance) - 12rem),
    28rem
  );
  overflow-y: hidden;
  resize: none;
  scroll-margin-bottom: calc(var(--kb-inset, 0px) + 6rem);
}
</style>
