import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { beforeUserCreated, HttpsError } from "firebase-functions/v2/identity";

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
