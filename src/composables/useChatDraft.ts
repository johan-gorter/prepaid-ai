/**
 * Draft persistence for the private chat page.
 *
 * This is the subtle code protecting the sign-in / buy-credits detour
 * (docs/viral-flow.md invariant 1): when a guest hits Send without enough
 * balance we stash the conversation + typed input + credit limit in IndexedDB,
 * send them through login or Stripe, then restore everything on return so they
 * land exactly where they left off. It is the twin of `useImpressionDraft.ts`
 * (#94) — the two halves of the "work survives the sign-in detour" invariant —
 * and is kept side by side with it on purpose.
 */

import { watch, type Ref } from "vue";
import { idbGet, idbSet } from "./useIdbStorage";
import type { ChatMessage } from "./useChat";

const CHAT_DRAFT_KEY = "chatDraft";

interface ChatDraft {
  messages: ChatMessage[];
  input: string;
  maxCredits: number;
}

export interface ChatDraftContext {
  messages: Ref<ChatMessage[]>;
  input: Ref<string>;
  maxCredits: Ref<number>;
  streaming: Ref<boolean>;
}

export function useChatDraft(ctx: ChatDraftContext) {
  const { messages, input, maxCredits, streaming } = ctx;

  async function persist(): Promise<void> {
    // JSON round-trip strips Vue's reactive Proxy wrapper on `messages.value`
    // — without it, IndexedDB's structured clone throws DataCloneError and the
    // draft never lands. The catch below would swallow that silently, so a
    // user typing then bouncing through buy-credits → login would return to a
    // blank input.
    const draft: ChatDraft = {
      messages: JSON.parse(JSON.stringify(messages.value)),
      input: input.value,
      maxCredits: maxCredits.value,
    };
    try {
      await idbSet(CHAT_DRAFT_KEY, draft);
    } catch (err) {
      console.error("Failed to persist chat draft", err);
    }
  }

  async function restore(): Promise<void> {
    const draft = await idbGet<ChatDraft>(CHAT_DRAFT_KEY);
    if (!draft || !Array.isArray(draft.messages)) return;
    // The textarea autofocuses and accepts keystrokes immediately, so the
    // user may have already typed something during the IDB read. Restore each
    // field only if it would not clobber that input.
    if (messages.value.length === 0) {
      messages.value = draft.messages;
    }
    if (!input.value) {
      input.value = draft.input ?? "";
    }
    if (typeof draft.maxCredits === "number") {
      maxCredits.value = draft.maxCredits;
    }
  }

  // Persist chat state only at meaningful checkpoints. Skipping streaming
  // avoids a per-chunk write to IndexedDB (useChat reassigns messages.value[idx]
  // per chunk), which would scale O(history²) for long replies.
  watch([input, maxCredits], () => {
    if (streaming.value) return;
    void persist();
  });
  watch(streaming, (isStreamingNow, wasStreaming) => {
    if (wasStreaming && !isStreamingNow) {
      // Capture the final messages array exactly once when the response ends.
      void persist();
    }
  });

  return { persist, restore };
}
