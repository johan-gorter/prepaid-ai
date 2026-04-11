import { ref } from "vue";
import { firebaseApp } from "../firebase";

// Mirror of server-side constants from functions/src/credits.ts
const GEMINI_PRO_INPUT_PRICE_PER_M = 1.25; // USD per 1M input tokens
const CREDIT_AI_USD = 0.008; // 1 credit = $0.008 of AI budget

/**
 * Client-side credit estimate for a chat turn.
 * Uses ~4 chars/token approximation for input token count.
 * Adds 2 credits to cover the response.
 */
export function estimateLocalCredits(
  messages: ChatMessage[],
  inputText: string,
): number {
  const allText = messages.map((m) => m.text).join(" ") + " " + inputText;
  const estimatedTokens = Math.ceil(allText.length / 4);
  const inputCostUsd = (estimatedTokens / 1_000_000) * GEMINI_PRO_INPUT_PRICE_PER_M;
  const inputCredits = Math.ceil(inputCostUsd / CREDIT_AI_USD);
  return inputCredits + 2;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export interface ChatEstimate {
  inputTokens: number;
  maxOutputTokens: number;
  estimatedCredits: number;
}

export interface ChatDone {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  credits: number;
}

export function useChat() {
  const messages = ref<ChatMessage[]>([]);
  const streaming = ref(false);
  const estimate = ref<ChatEstimate | null>(null);
  const lastCost = ref<ChatDone | null>(null);
  const error = ref<string | null>(null);

  let abortController: AbortController | null = null;

  /** Build the Cloud Function URL. Works with both emulators and production. */
  async function getChatUrl(): Promise<string> {
    const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

    if (useEmulators) {
      return `http://127.0.0.1:5001/${projectId}/europe-west1/chat`;
    }
    return `https://europe-west1-${projectId}.cloudfunctions.net/chat`;
  }

  /** Get the current user's ID token for auth. */
  async function getIdToken(): Promise<string> {
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth(firebaseApp);
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");
    return user.getIdToken();
  }

  async function send(text: string, maxCredits: number) {
    error.value = null;
    estimate.value = null;
    lastCost.value = null;

    messages.value.push({ role: "user", text });

    // Placeholder for model response — will be filled by streaming chunks
    const modelMessage: ChatMessage = { role: "model", text: "" };
    messages.value.push(modelMessage);

    streaming.value = true;
    abortController = new AbortController();

    try {
      const [url, token] = await Promise.all([getChatUrl(), getIdToken()]);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: messages.value.slice(0, -1), // All except the empty model placeholder
          maxCredits,
        }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(await response.text());
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));

            if (eventType === "estimate") {
              estimate.value = data as ChatEstimate;
            } else if (eventType === "chunk") {
              modelMessage.text += data.text;
              // Trigger Vue reactivity
              const idx = messages.value.length - 1;
              messages.value[idx] = { ...modelMessage };
            } else if (eventType === "done") {
              lastCost.value = data as ChatDone;
            } else if (eventType === "error") {
              error.value = data.message;
            }
            eventType = "";
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") {
        // User cancelled — not an error
      } else {
        error.value = err instanceof Error ? err.message : "Chat error";
        // Remove the empty model message on error
        if (!modelMessage.text) {
          messages.value.pop();
        }
      }
    } finally {
      streaming.value = false;
      abortController = null;
    }
  }

  function stop() {
    abortController?.abort();
  }

  function clear() {
    messages.value = [];
    estimate.value = null;
    lastCost.value = null;
    error.value = null;
  }

  return { messages, streaming, estimate, lastCost, error, send, stop, clear };
}
