import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { beforeUserCreated, HttpsError } from "firebase-functions/v2/identity";

// Jimp and PNG chunk packages are devDependencies (emulator-only).
// They are lazy-imported inside dummyProcess() to avoid crashing in production.
type TextChunkModule = {
  encode(keyword: string, text: string): { name: string; data: Uint8Array };
  decode(data: Uint8Array): { keyword: string; text: string };
};

async function loadDummyDeps() {
  const { Jimp, loadFont } = await import("jimp");
  const { SANS_32_WHITE } = await import("jimp/fonts");
  const extractChunks = (await import("png-chunks-extract")).default;
  const encodeChunks = (await import("png-chunks-encode")).default;
  const textChunk =
    (await import("png-chunk-text")) as unknown as TextChunkModule;
  return {
    Jimp,
    loadFont,
    SANS_32_WHITE,
    extractChunks,
    encodeChunks,
    textChunk,
  };
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

/**
 * Extract the Storage path from a Firebase Storage download URL.
 */
function storagePathFromUrl(url: string): string {
  const match = url.match(/\/o\/([^?]+)/);
  if (!match) throw new Error(`Cannot parse storage path from URL: ${url}`);
  return decodeURIComponent(match[1]);
}

/**
 * Read the PromptLog from PNG tEXt metadata chunks.
 */
function readPromptLog(
  textChunk: TextChunkModule,
  chunks: Array<{ name: string; data: Uint8Array }>,
): string[] {
  for (const chunk of chunks) {
    if (chunk.name === "tEXt") {
      const decoded = textChunk.decode(chunk.data);
      if (decoded.keyword === "PromptLog") {
        try {
          return JSON.parse(decoded.text) as string[];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

/**
 * Replace or insert a PromptLog tEXt chunk in the PNG chunks array.
 */
function writePromptLog(
  textChunk: TextChunkModule,
  chunks: Array<{ name: string; data: Uint8Array }>,
  promptLog: string[],
): Array<{ name: string; data: Uint8Array }> {
  const filtered = chunks.filter((chunk) => {
    if (chunk.name !== "tEXt") return true;
    const decoded = textChunk.decode(chunk.data);
    return decoded.keyword !== "PromptLog";
  });
  const newChunk = textChunk.encode("PromptLog", JSON.stringify(promptLog));
  filtered.splice(-1, 0, newChunk);
  return filtered;
}

/**
 * Dummy image processing: overlay prompt log as white text on the image.
 * Used when no AI backend is configured (emulator only).
 */
async function dummyProcess(
  imageBuffer: Buffer,
  prompt: string,
): Promise<Buffer> {
  const {
    Jimp,
    loadFont,
    SANS_32_WHITE,
    extractChunks,
    encodeChunks,
    textChunk,
  } = await loadDummyDeps();

  const pngBuffer = await Jimp.read(imageBuffer).then((img) =>
    img.getBuffer("image/png"),
  );
  const chunks = extractChunks(new Uint8Array(pngBuffer));
  const promptLog = readPromptLog(textChunk, chunks);
  promptLog.push(prompt);

  const image = await Jimp.read(pngBuffer);
  const font = await loadFont(SANS_32_WHITE);
  const textLines = promptLog.map((p: string, i: number) => `${i + 1}. ${p}`);
  const fullText = ["Modification Log:", ...textLines].join("\n");

  image.print({
    font,
    x: 20,
    y: 20,
    text: fullText,
    maxWidth: image.width - 40,
  });

  const resultBuffer = await image.getBuffer("image/png");
  const resultChunks = extractChunks(new Uint8Array(resultBuffer));
  const finalChunks = writePromptLog(textChunk, resultChunks, promptLog);
  return Buffer.from(encodeChunks(finalChunks));
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
              mimeType: "image/png",
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

      if (backend === "dummy") {
        resultBuffer = await dummyProcess(fileBuffer, prompt);
      } else {
        resultBuffer = await geminiProcess(backend, fileBuffer, prompt);
      }

      // Upload result to Storage
      const resultPath = `users/${userId}/results/${renovationId}/${impressionId}.png`;
      const resultFile = bucket.file(resultPath);
      await resultFile.save(resultBuffer, {
        metadata: { contentType: "image/png" },
      });

      await impressionRef.update({
        status: "completed",
        resultImagePath: resultPath,
      });
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
