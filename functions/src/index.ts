import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { VertexAI } from "@google-cloud/vertexai";
import { Jimp, loadFont } from "jimp";
import { SANS_32_WHITE } from "jimp/fonts";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const extractChunks = require("png-chunks-extract");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const encodeChunks = require("png-chunks-encode");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const textChunk = require("png-chunk-text");

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
  // Default: use google-ai if key is present, otherwise dummy
  if (process.env.GEMINI_API_KEY) return "google-ai";
  return "dummy";
}

const GEMINI_MODEL = "gemini-2.5-flash";

/**
 * Extract the Storage path from a Firebase Storage download URL.
 * Handles both emulator and production URL formats.
 */
function storagePathFromUrl(url: string): string {
  // Both formats contain /o/<encoded-path>
  const match = url.match(/\/o\/([^?]+)/);
  if (!match) throw new Error(`Cannot parse storage path from URL: ${url}`);
  return decodeURIComponent(match[1]);
}

/**
 * Read the PromptLog from PNG tEXt metadata chunks.
 */
function readPromptLog(
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
 * Inserts before the IEND chunk to maintain valid PNG structure.
 */
function writePromptLog(
  chunks: Array<{ name: string; data: Uint8Array }>,
  promptLog: string[],
): Array<{ name: string; data: Uint8Array }> {
  // Remove any existing PromptLog tEXt chunk
  const filtered = chunks.filter((chunk) => {
    if (chunk.name !== "tEXt") return true;
    const decoded = textChunk.decode(chunk.data);
    return decoded.keyword !== "PromptLog";
  });

  // Insert new PromptLog chunk before IEND (last chunk)
  const newChunk = textChunk.encode("PromptLog", JSON.stringify(promptLog));
  filtered.splice(-1, 0, newChunk);
  return filtered;
}

/**
 * Dummy image processing: overlay prompt log as white text on the image.
 * Used when no AI backend is configured.
 */
async function dummyProcess(
  imageBuffer: Buffer,
  prompt: string,
): Promise<Buffer> {
  // Ensure we have a valid PNG (input may be JPEG/WebP/etc.)
  const pngBuffer = await Jimp.read(imageBuffer).then((img) =>
    img.getBuffer("image/png"),
  );

  // Extract PNG chunks to read/write metadata
  const chunks = extractChunks(new Uint8Array(pngBuffer));

  // Read existing prompt log and append current prompt
  const promptLog = readPromptLog(chunks);
  promptLog.push(prompt);

  // Use jimp to overlay text on the image
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

  // Get the processed image as a PNG buffer
  const resultBuffer = await image.getBuffer("image/png");

  // Re-extract chunks from the jimp output (to get the image data chunks)
  // then write our metadata into them
  const resultChunks = extractChunks(new Uint8Array(resultBuffer));
  const finalChunks = writePromptLog(resultChunks, promptLog);

  return Buffer.from(encodeChunks(finalChunks));
}

// ---------------------------------------------------------------------------
// Shared types and helpers for Gemini response parsing
// ---------------------------------------------------------------------------
interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

function buildPromptParts(
  imageBuffer: Buffer,
  maskBuffer: Buffer | null,
  prompt: string,
): { text: string; imagePart: GeminiPart; maskPart: GeminiPart | null } {
  const text = maskBuffer
    ? `Edit this image. Use the provided mask image as a guide: the white areas in the mask indicate the regions to modify. Task: ${prompt}. Return ONLY the full modified image, nothing else.`
    : `Edit this image. Task: ${prompt}. Return ONLY the full modified image, nothing else.`;

  const imagePart: GeminiPart = {
    inlineData: {
      mimeType: "image/png",
      data: imageBuffer.toString("base64"),
    },
  };

  const maskPart: GeminiPart | null = maskBuffer
    ? {
        inlineData: {
          mimeType: "image/png",
          data: maskBuffer.toString("base64"),
        },
      }
    : null;

  return { text, imagePart, maskPart };
}

function extractImageFromResponse(responseParts: GeminiPart[]): Buffer {
  for (const part of responseParts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }
  throw new Error(
    "Gemini response did not contain an image. Response: " +
      JSON.stringify(responseParts).substring(0, 500),
  );
}

// ---------------------------------------------------------------------------
// Google AI Studio backend (uses API key)
// ---------------------------------------------------------------------------
async function googleAiProcess(
  apiKey: string,
  imageBuffer: Buffer,
  maskBuffer: Buffer | null,
  prompt: string,
): Promise<Buffer> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    } as Record<string, unknown>,
  });

  const { text, imagePart, maskPart } = buildPromptParts(
    imageBuffer,
    maskBuffer,
    prompt,
  );
  const parts = maskPart
    ? [text, imagePart, maskPart]
    : [text, imagePart];

  const result = await model.generateContent(parts as Parameters<typeof model.generateContent>[0]);
  const response = result.response;
  const candidates = response.candidates;

  if (!candidates || candidates.length === 0) {
    throw new Error(
      "Gemini returned no candidates. Response: " +
        JSON.stringify(response).substring(0, 500),
    );
  }

  const responseParts = (candidates[0].content?.parts ?? []) as GeminiPart[];
  return extractImageFromResponse(responseParts);
}

// ---------------------------------------------------------------------------
// Vertex AI backend (uses service account auth, global region)
// ---------------------------------------------------------------------------
async function vertexAiProcess(
  projectId: string,
  imageBuffer: Buffer,
  maskBuffer: Buffer | null,
  prompt: string,
): Promise<Buffer> {
  const vertexAI = new VertexAI({ project: projectId, location: "global" });
  const model = vertexAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    } as Record<string, unknown>,
  });

  const { text, imagePart, maskPart } = buildPromptParts(
    imageBuffer,
    maskBuffer,
    prompt,
  );

  const contentParts = maskPart
    ? [{ text }, imagePart, maskPart]
    : [{ text }, imagePart];

  const result = await model.generateContent({
    contents: [{ role: "user" as const, parts: contentParts }],
  } as Parameters<typeof model.generateContent>[0]);
  const candidates = result.response.candidates;

  if (!candidates || candidates.length === 0) {
    throw new Error(
      "Vertex AI returned no candidates. Response: " +
        JSON.stringify(result.response).substring(0, 500),
    );
  }

  const responseParts = (candidates[0].content?.parts ?? []) as GeminiPart[];
  return extractImageFromResponse(responseParts);
}

// ---------------------------------------------------------------------------
// Cloud Function trigger
// ---------------------------------------------------------------------------
export const processImpression = onDocumentCreated(
  {
    document:
      "users/{userId}/renovations/{renovationId}/impressions/{impressionId}",
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
    const maskImagePath = impressionData.maskImagePath as string | undefined;

    const impressionRef = db.doc(
      `users/${userId}/renovations/${renovationId}/impressions/${impressionId}`,
    );

    try {
      await impressionRef.update({ status: "processing" });

      // Download source image from Storage
      const storagePath =
        sourceImagePath ?? storagePathFromUrl(sourceImageUrl ?? "");
      const [fileBuffer] = await bucket.file(storagePath).download();

      // Download mask image if present
      let maskBuffer: Buffer | null = null;
      if (maskImagePath) {
        const [downloaded] = await bucket.file(maskImagePath).download();
        maskBuffer = downloaded;
      }

      let resultBuffer: Buffer;
      const backend = getAiBackend();
      console.log(`Processing with backend: ${backend}`);

      switch (backend) {
        case "vertex": {
          const projectId =
            process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
          if (!projectId) throw new Error("GCP project ID not available");
          resultBuffer = await vertexAiProcess(
            projectId,
            fileBuffer,
            maskBuffer,
            prompt,
          );
          break;
        }
        case "google-ai": {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
          resultBuffer = await googleAiProcess(
            apiKey,
            fileBuffer,
            maskBuffer,
            prompt,
          );
          break;
        }
        case "dummy":
        default:
          resultBuffer = await dummyProcess(fileBuffer, prompt);
          break;
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
