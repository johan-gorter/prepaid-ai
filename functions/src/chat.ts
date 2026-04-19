import { onRequest } from "firebase-functions/v2/https";
import { admin, db } from "./admin.js";
import { createGenAIClient, GEMINI_CHAT_MODEL, getAiBackend } from "./ai.js";
import { deductCredits } from "./balance.js";
import {
  chatCostCredits,
  estimateChatCredits,
  maxOutputTokensForBudget,
} from "./credits.js";
import { getAllowedOrigins } from "./utils.js";

export const chat = onRequest(
  {
    region: "europe-west1",
    cors: getAllowedOrigins(),
    secrets: ["GEMINI_API_KEY", "AI_BACKEND", "AI_REGION"],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Authenticate via Firebase ID token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).send("Unauthorized");
      return;
    }
    let uid: string;
    try {
      const decoded = await admin
        .auth()
        .verifyIdToken(authHeader.split("Bearer ")[1]);
      uid = decoded.uid;
    } catch {
      res.status(401).send("Invalid token");
      return;
    }

    // Parse request
    const { messages, maxCredits } = req.body as {
      messages: Array<{ role: "user" | "model"; text: string }>;
      maxCredits: number;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).send("messages is required");
      return;
    }
    if (typeof maxCredits !== "number" || maxCredits <= 0) {
      res.status(400).send("maxCredits must be a positive number");
      return;
    }

    // Validate message roles — only "user" and "model" are allowed
    const validRoles = new Set(["user", "model"]);
    for (const m of messages) {
      if (!validRoles.has(m.role) || typeof m.text !== "string") {
        res.status(400).send("Invalid message format");
        return;
      }
    }

    // Verify user has sufficient balance before proceeding
    const userSnap = await db.doc(`users/${uid}`).get();
    const userBalance: number = userSnap.data()?.balance ?? 0;
    if (userBalance <= 0) {
      res.status(402).send("Insufficient balance");
      return;
    }
    // Cap maxCredits to actual balance
    const effectiveMaxCredits = Math.min(maxCredits, userBalance);

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Convert to Gemini content format
    const contents = messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const backend = getAiBackend();

    // ----- Dummy backend (emulator) -----
    if (backend === "dummy") {
      const lastMessage = messages[messages.length - 1].text;
      const dummyReply = `[dummy] Echo: ${lastMessage}`;
      const inputTokens = messages.reduce(
        (sum, m) => sum + Math.ceil(m.text.length / 4),
        0,
      );
      const outputTokens = Math.ceil(dummyReply.length / 4);

      sendEvent("estimate", {
        inputTokens,
        maxOutputTokens: 1000,
        estimatedCredits: 1,
      });

      for (const char of dummyReply) {
        sendEvent("chunk", { text: char });
      }

      sendEvent("done", {
        inputTokens,
        outputTokens,
        thinkingTokens: 0,
        credits: chatCostCredits(inputTokens, outputTokens),
      });

      // Deduct credits (best-effort in dummy mode)
      const dummyCredits = chatCostCredits(inputTokens, outputTokens);
      try {
        await deductCredits(uid, dummyCredits, "chat_message", {
          inputTokens,
          outputTokens,
        });
      } catch (e) {
        console.warn("Dummy chat credit deduction failed:", e);
      }

      res.end();
      return;
    }

    // ----- Real Gemini backend -----
    try {
      const ai = await createGenAIClient(backend);

      // Count input tokens
      const tokenResponse = await ai.models.countTokens({
        model: GEMINI_CHAT_MODEL,
        contents,
      });
      const inputTokens = tokenResponse.totalTokens ?? 0;

      // Compute max output tokens from credit budget
      const maxTokens = maxOutputTokensForBudget(
        effectiveMaxCredits,
        inputTokens,
      );
      if (maxTokens <= 0) {
        sendEvent("error", {
          message: "Insufficient credits for this prompt",
        });
        res.end();
        return;
      }

      // Send cost estimate to client
      sendEvent("estimate", {
        inputTokens,
        maxOutputTokens: maxTokens,
        estimatedCredits: estimateChatCredits(inputTokens, maxTokens),
        balance: userBalance,
      });

      // Track client disconnect
      let disconnected = false;
      req.on("close", () => {
        disconnected = true;
      });

      // Stream generation
      let accumulatedText = "";
      let usageMetadata: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
        totalTokenCount?: number;
      } | null = null;

      const stream = await ai.models.generateContentStream({
        model: GEMINI_CHAT_MODEL,
        contents,
        config: {
          maxOutputTokens: maxTokens,
        },
      });

      for await (const chunk of stream) {
        if (disconnected) break;

        if (chunk.text) {
          accumulatedText += chunk.text;
          sendEvent("chunk", { text: chunk.text });
        }
        if (chunk.usageMetadata) {
          usageMetadata = chunk.usageMetadata;
        }
      }

      // Compute actual cost
      let actualOutputTokens: number;
      let thinkingTokens = 0;

      if (usageMetadata) {
        // Exact counts from the API
        actualOutputTokens =
          (usageMetadata.candidatesTokenCount ?? 0) +
          (usageMetadata.thoughtsTokenCount ?? 0);
        thinkingTokens = usageMetadata.thoughtsTokenCount ?? 0;
      } else if (disconnected && accumulatedText) {
        // Aborted — count the text we did receive
        const countResult = await ai.models.countTokens({
          model: GEMINI_CHAT_MODEL,
          contents: [{ role: "model", parts: [{ text: accumulatedText }] }],
        });
        actualOutputTokens =
          countResult.totalTokens ?? Math.ceil(accumulatedText.length / 4);
      } else {
        actualOutputTokens = Math.ceil(accumulatedText.length / 4);
      }

      const credits = chatCostCredits(inputTokens, actualOutputTokens);

      if (!disconnected) {
        sendEvent("done", {
          inputTokens,
          outputTokens: actualOutputTokens,
          thinkingTokens,
          credits,
        });
      }

      // Deduct actual credits from user's balance
      try {
        await deductCredits(uid, credits, "chat_message", {
          inputTokens,
          outputTokens: actualOutputTokens,
          thinkingTokens,
        });
      } catch (balanceErr: unknown) {
        console.warn(
          "Balance deduction failed:",
          balanceErr instanceof Error ? balanceErr.message : balanceErr,
        );
      }

      res.end();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Chat error";
      console.error("Chat error:", message);
      if (!res.headersSent) {
        res.status(500).send(message);
      } else {
        sendEvent("error", { message });
        res.end();
      }
    }
  },
);
