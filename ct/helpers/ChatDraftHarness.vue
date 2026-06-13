<script setup lang="ts">
/**
 * Browser-side harness driving `useChatDraft` for component tests.
 *
 * CT test bodies run in Node (no IndexedDB), so the composable — which persists
 * the chat draft to the IDB-backed key/value store — is exercised here inside a
 * mounted component. Each action button runs a sequence then mirrors the
 * resulting ref + IndexedDB state into the DOM for the test to assert on.
 */
import { onMounted, ref } from "vue";
import { useChatDraft } from "../../src/composables/useChatDraft";
import type { ChatMessage } from "../../src/composables/useChat";
import { idbDelete, idbGet, idbSet } from "../../src/composables/useIdbStorage";

const CHAT_DRAFT_KEY = "chatDraft";

interface StoredDraft {
  messages: ChatMessage[];
  input: string;
  maxCredits: number;
}

const messages = ref<ChatMessage[]>([]);
const input = ref("");
const maxCredits = ref(15);
const streaming = ref(false);

const { persist, restore } = useChatDraft({
  messages,
  input,
  maxCredits,
  streaming,
});

const idbInput = ref("");
const idbMaxCredits = ref("");
const idbMsgCount = ref("");
const idbNull = ref(false);

async function refreshIdb() {
  const d = await idbGet<StoredDraft>(CHAT_DRAFT_KEY);
  idbNull.value = d === null;
  idbInput.value = d?.input ?? "";
  idbMaxCredits.value = d ? String(d.maxCredits) : "";
  idbMsgCount.value = d ? String(d.messages.length) : "";
}

async function waitForIdbInput(value: string) {
  // The persist watchers fire asynchronously; spin until IDB catches up so the
  // readout the test asserts on is deterministic.
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 10));
    if ((await idbGet<StoredDraft>(CHAT_DRAFT_KEY))?.input === value) break;
  }
  await refreshIdb();
}

onMounted(async () => {
  // Guarantee a clean store regardless of context reuse between tests.
  await idbDelete(CHAT_DRAFT_KEY);
  await refreshIdb();
});

async function onPersist() {
  // Assign through reactive refs so the persisted value carries Vue's Proxy —
  // exercises the JSON round-trip that prevents a structured-clone DataCloneError.
  messages.value = [
    { role: "user", text: "hello" },
    { role: "model", text: "hi there" },
  ];
  input.value = "hello";
  maxCredits.value = 20;
  await persist();
  await refreshIdb();
}

async function onRestoreEmpty() {
  const seeded: StoredDraft = {
    messages: [{ role: "user", text: "restored msg" }],
    input: "restored input",
    maxCredits: 9,
  };
  await idbSet(CHAT_DRAFT_KEY, seeded);
  messages.value = [];
  input.value = "";
  await restore();
}

async function onRestoreNoClobber() {
  const seeded: StoredDraft = {
    messages: [{ role: "user", text: "draft msg" }],
    input: "draft input",
    maxCredits: 30,
  };
  await idbSet(CHAT_DRAFT_KEY, seeded);
  // Simulate the user having already typed while the IDB read was in flight.
  messages.value = [{ role: "user", text: "typed msg" }];
  input.value = "typed";
  await restore();
}

async function onEditInput() {
  input.value = "edited";
  await waitForIdbInput("edited");
}

async function onEditWhileStreaming() {
  // Seed a known persisted value, then edit mid-stream — must NOT overwrite it.
  input.value = "before stream";
  await waitForIdbInput("before stream");
  streaming.value = true;
  input.value = "during stream";
  // Give any (incorrect) watcher write a chance to land before asserting.
  await new Promise((r) => setTimeout(r, 100));
  await refreshIdb();
}

async function onStreamEnd() {
  streaming.value = true;
  messages.value = [
    { role: "user", text: "q" },
    { role: "model", text: "streamed answer" },
  ];
  input.value = "post stream";
  streaming.value = false;
  await waitForIdbInput("post stream");
}
</script>

<template>
  <div>
    <button data-testid="btn-persist" @click="onPersist">persist</button>
    <button data-testid="btn-restore-empty" @click="onRestoreEmpty">
      restoreEmpty
    </button>
    <button data-testid="btn-restore-noclobber" @click="onRestoreNoClobber">
      restoreNoClobber
    </button>
    <button data-testid="btn-edit-input" @click="onEditInput">editInput</button>
    <button data-testid="btn-edit-streaming" @click="onEditWhileStreaming">
      editStreaming
    </button>
    <button data-testid="btn-stream-end" @click="onStreamEnd">streamEnd</button>

    <span data-testid="input-val">{{ input }}</span>
    <span data-testid="maxcredits-val">{{ maxCredits }}</span>
    <span data-testid="msg-count">{{ messages.length }}</span>
    <span data-testid="idb-input">{{ idbInput }}</span>
    <span data-testid="idb-maxcredits">{{ idbMaxCredits }}</span>
    <span data-testid="idb-msgcount">{{ idbMsgCount }}</span>
    <span data-testid="idb-null">{{ idbNull ? "yes" : "no" }}</span>
  </div>
</template>
