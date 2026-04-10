import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { beforeUserCreated } from "firebase-functions/v2/identity";
import {
  chatCostCredits,
  estimateChatCredits,
  imageGenerationCredits,
  maxOutputTokensForBudget,
} from "./credits.js";

// Jimp is a devDependency (emulator-only).
// It is lazy-imported inside dummyProcess() to avoid crashing in production.

async function loadDummyDeps() {
  const { Jimp, loadFont } = await import("jimp");
  const { SANS_32_WHITE } = await import("jimp/fonts");
  return { Jimp, loadFont, SANS_32_WHITE };
}

admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();

// ---------------------------------------------------------------------------
// AI backend selection: "vertex" | "google-ai" | "dummy"
// Set via environment variable AI_BACKEND. Defaults to "google-ai".
// - "vertex"    — Vertex AI (uses service account auth, no API key needed)
// - "google-ai" — Google AI Studio (uses GEMINI_API_KEY secret)
// - "dummy"     — Jimp text overlay (no AI, for testing)
// ---------------------------------------------------------------------------
type AiBackend = "vertex" | "google-ai" | "dummy";

function getAiBackend(): AiBackend {
  const raw = process.env.AI_BACKEND?.toLowerCase();
  if (raw === "vertex" || raw === "google-ai" || raw === "dummy") return raw;
  if (process.env.GEMINI_API_KEY) return "google-ai";
  return "dummy";
}

const GEMINI_MODEL = "gemini-2.5-flash-image";
const GEMINI_CHAT_MODEL = "gemini-2.5-pro";

// ---------------------------------------------------------------------------
// Balance transaction reason keys (translated client-side)
// ---------------------------------------------------------------------------
type TransactionReasonKey =
  | "image_generation"
  | "chat_message"
  | "credit_purchase"
  | "admin_adjustment";

/**
 * Deduct credits from a user's balance inside a Firestore transaction.
 * Creates a document in `users/{uid}/balanceTransactions` and decrements
 * `users/{uid}.balance`.
 *
 * Returns the new balance, or throws if insufficient funds.
 */
async function deductCredits(
  userId: string,
  credits: number,
  reasonKey: TransactionReasonKey,
  metadata?: Record<string, unknown>,
): Promise<number> {
  const userRef = db.doc(`users/${userId}`);
  const txnCollection = db.collection(`users/${userId}/balanceTransactions`);

  return db.runTransaction(async (txn) => {
    const userSnap = await txn.get(userRef);
    const currentBalance: number = userSnap.data()?.balance ?? 0;
    const newBalance = currentBalance - credits;

    if (newBalance < 0) {
      throw new Error(
        `Insufficient balance: need ${credits}, have ${currentBalance}`,
      );
    }

    const txnRef = txnCollection.doc();
    txn.set(txnRef, {
      reasonKey,
      amount: -credits,
      balanceAfter: newBalance,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...metadata,
    });
    txn.update(userRef, { balance: newBalance });

    return newBalance;
  });
}

/**
 * Extract the Storage path from a Firebase Storage download URL.
 */
function storagePathFromUrl(url: string): string {
  const match = url.match(/\/o\/([^?]+)/);
  if (!match) throw new Error(`Cannot parse storage path from URL: ${url}`);
  return decodeURIComponent(match[1]);
}

/**
 * Dummy image processing: overlay prompt as white text on the image.
 * Used when no AI backend is configured (emulator only).
 */
async function dummyProcess(
  _imageBuffer: Buffer,
  prompt: string,
): Promise<Buffer> {
  const { Jimp, loadFont, SANS_32_WHITE } = await loadDummyDeps();

  // Jimp does not support WebP decoding, so create a fresh image instead
  // of reading the uploaded (WebP) buffer. This is fine for testing.
  const image = new Jimp({ width: 800, height: 600, color: 0x808080ff });
  const font = await loadFont(SANS_32_WHITE);

  image.print({
    font,
    x: 20,
    y: 20,
    text: prompt,
    maxWidth: image.width - 40,
  });

  return Buffer.from(await image.getBuffer("image/png"));
}

// ---------------------------------------------------------------------------
// Gemini image editing — the client sends a pre-composited image with a
// semi-transparent red overlay on the edit area. No server-side image
// processing needed.
// ---------------------------------------------------------------------------

async function loadGenAI() {
  const { GoogleGenAI } = await import("@google/genai");
  return GoogleGenAI;
}

function createGenAI(
  GoogleGenAI: Awaited<ReturnType<typeof loadGenAI>>,
  backend: "google-ai" | "vertex",
) {
  if (backend === "vertex") {
    return new GoogleGenAI({
      vertexai: true,
      project: process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT,
      location: "europe-west1",
    });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  return new GoogleGenAI({ apiKey });
}

async function geminiProcess(
  backend: "google-ai" | "vertex",
  imageBuffer: Buffer,
  prompt: string,
): Promise<Buffer> {
  const GoogleGenAI = await loadGenAI();
  const ai = createGenAI(GoogleGenAI, backend);

  const editPrompt =
    `Edit the area highlighted in red: ${prompt}. ` +
    `Keep everything else unchanged. Remove the red overlay in the output.`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: editPrompt },
          {
            inlineData: {
              mimeType: "image/webp",
              data: imageBuffer.toString("base64"),
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }

  const textParts = parts
    .map((p) => p.text)
    .filter(Boolean)
    .join(" ");
  throw new Error(
    "Gemini response did not contain an image. Response: " +
      (textParts || JSON.stringify(response).substring(0, 500)),
  );
}

// ---------------------------------------------------------------------------
// Cloud Function trigger
// ---------------------------------------------------------------------------
export const processImpression = onDocumentCreated(
  {
    document:
      "users/{userId}/renovations/{renovationId}/impressions/{impressionId}",
    region: "europe-west1",
    secrets: ["GEMINI_API_KEY"],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const { userId, renovationId, impressionId } = event.params;
    const impressionData = snapshot.data();
    const prompt = impressionData.prompt as string;
    const sourceImagePath = impressionData.sourceImagePath as
      | string
      | undefined;
    const sourceImageUrl = impressionData.sourceImageUrl as string | undefined;
    const compositeImagePath = impressionData.compositeImagePath as
      | string
      | undefined;

    const impressionRef = db.doc(
      `users/${userId}/renovations/${renovationId}/impressions/${impressionId}`,
    );

    // Check balance before processing
    const userRef = db.doc(`users/${userId}`);
    const userBalanceSnap = await userRef.get();
    const currentBalance: number = userBalanceSnap.data()?.balance ?? 0;
    const requiredCredits = imageGenerationCredits();

    if (currentBalance < requiredCredits) {
      await impressionRef.update({
        status: "failed",
        error: `Insufficient balance: need ${requiredCredits} credits, have ${currentBalance}`,
      });
      return;
    }

    try {
      await impressionRef.update({ status: "processing" });

      // Prefer the pre-composited image (with red overlay baked in)
      const imagePath =
        compositeImagePath ??
        sourceImagePath ??
        storagePathFromUrl(sourceImageUrl ?? "");
      const [fileBuffer] = await bucket.file(imagePath).download();

      let resultBuffer: Buffer;
      const backend = getAiBackend();
      console.log(`Processing with backend: ${backend}`);

      // Dummy backend outputs PNG (Jimp has no WebP support).
      // Production backends output WebP.
      let resultContentType: string;
      let resultExt: string;

      if (backend === "dummy") {
        resultBuffer = await dummyProcess(fileBuffer, prompt);
        resultContentType = "image/png";
        resultExt = "png";
      } else {
        resultBuffer = await geminiProcess(backend, fileBuffer, prompt);
        resultContentType = "image/webp";
        resultExt = "webp";
      }

      // Upload result to Storage
      const resultPath = `users/${userId}/results/${renovationId}/${impressionId}.${resultExt}`;
      const resultFile = bucket.file(resultPath);
      await resultFile.save(resultBuffer, {
        metadata: { contentType: resultContentType },
      });

      await impressionRef.update({
        status: "completed",
        resultImagePath: resultPath,
      });

      // Deduct credits for image generation
      try {
        await deductCredits(
          userId,
          imageGenerationCredits(),
          "image_generation",
          {
            renovationId,
            impressionId,
          },
        );
      } catch (balanceErr: unknown) {
        console.warn(
          "Balance deduction failed (processing still succeeded):",
          balanceErr instanceof Error ? balanceErr.message : balanceErr,
        );
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown processing error";
      console.error("Error processing impression:", errorMessage);
      await impressionRef.update({
        status: "failed",
        error: errorMessage,
      });
    }
  },
);

// ---------------------------------------------------------------------------
// Blocking function — restrict non-production sign-ups to @johangorter.com
// ---------------------------------------------------------------------------
const ALLOWED_DOMAIN = "johangorter.com";

export const beforeCreate = beforeUserCreated(
  { region: "europe-west1" },
  (event) => {
    // Skip domain check in production and when running in the Firebase emulator
    const env = process.env.ENVIRONMENT;
    if (env === "production") return;
    if (process.env.FUNCTIONS_EMULATOR === "true") return;

    const email = event.data?.email;
    if (!email || !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      throw new HttpsError(
        "permission-denied",
        `Only @${ALLOWED_DOMAIN} accounts are allowed in this environment`,
      );
    }
  },
);

// ---------------------------------------------------------------------------
// Callable function — delete all user data (Firestore + Storage)
// ---------------------------------------------------------------------------
export const deleteUserAccount = onCall(
  { region: "europe-west1", timeoutSeconds: 120 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    // Delete all renovations and their impressions subcollections
    const renovationsRef = db.collection(`users/${uid}/renovations`);
    const renovations = await renovationsRef.listDocuments();
    for (const renoDoc of renovations) {
      const impressions = await renoDoc
        .collection("impressions")
        .listDocuments();
      for (const impDoc of impressions) {
        await impDoc.delete();
      }
      await renoDoc.delete();
    }

    // Delete balance transactions
    const balanceTxns = await db
      .collection(`users/${uid}/balanceTransactions`)
      .listDocuments();
    for (const txnDoc of balanceTxns) {
      await txnDoc.delete();
    }

    // Delete all user files from Storage
    try {
      await bucket.deleteFiles({ prefix: `users/${uid}/` });
    } catch {
      // Ignore if no files exist
    }

    // Delete feedback documents authored by this user
    const feedbackQuery = db.collection("feedback").where("uid", "==", uid);
    const feedbackDocs = await feedbackQuery.get();
    for (const feedbackDoc of feedbackDocs.docs) {
      await feedbackDoc.ref.delete();
    }

    // Delete the user profile document
    await db.doc(`users/${uid}`).delete();

    return { success: true };
  },
);

// ---------------------------------------------------------------------------
// CORS — built from ALLOWED_ORIGINS env var (comma-separated URLs).
// Falls back to localhost-only for emulator mode.
// Set via `firebase functions:config` or env vars in firebase.json.
// ---------------------------------------------------------------------------
function getAllowedOrigins(): (string | RegExp)[] {
  const raw = process.env.ALLOWED_ORIGINS;
  if (raw) {
    return raw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  // Default: localhost only (emulator / dev)
  return [/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
}

// ---------------------------------------------------------------------------
// Streaming chat — Gemini 2.5 Pro via SSE (no conversation stored)
// ---------------------------------------------------------------------------

export const chat = onRequest(
  {
    region: "europe-west1",
    cors: getAllowedOrigins(),
    secrets: ["GEMINI_API_KEY"],
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
      } catch {
        /* ignore in dummy mode */
      }

      res.end();
      return;
    }

    // ----- Real Gemini backend -----
    try {
      const GoogleGenAI = await loadGenAI();
      const ai = createGenAI(GoogleGenAI, backend);

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
