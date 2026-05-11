<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  url: string;
}>();

const emit = defineEmits<{ close: [] }>();

const copied = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!open) copied.value = false;
  },
);

async function onCopy() {
  if (!props.url) return;
  let ok = false;
  try {
    await navigator.clipboard.writeText(props.url);
    ok = true;
  } catch {
    // Fallback for browsers without clipboard API permission
    const el = inputRef.value;
    if (el) {
      el.select();
      el.setSelectionRange(0, el.value.length);
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
    }
  }
  if (ok) copied.value = true;
}
</script>

<template>
  <dialog :class="{ active: open }" data-testid="share-dialog">
    <h5>Share impression</h5>
    <p>Anyone with this link can view this result image.</p>
    <div class="field border round">
      <input
        ref="inputRef"
        type="text"
        readonly
        :value="url"
        data-testid="share-url"
        @focus="($event.target as HTMLInputElement).select()"
      />
    </div>
    <nav>
      <button class="border" @click="emit('close')">Close</button>
      <button @click="onCopy" data-testid="share-copy">
        <i aria-hidden="true">{{ copied ? "check" : "content_copy" }}</i>
        <span>{{ copied ? "Copied" : "Copy" }}</span>
      </button>
    </nav>
  </dialog>
</template>
