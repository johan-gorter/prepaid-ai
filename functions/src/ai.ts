// ---------------------------------------------------------------------------
// AI backend selection: "vertex" | "google-ai" | "dummy"
// Set via environment variable AI_BACKEND. Defaults to "google-ai".
// - "vertex"    — Vertex AI (uses service account auth, no API key needed)
// - "google-ai" — Google AI Studio (uses GEMINI_API_KEY secret)
// - "dummy"     — Jimp text overlay (no AI, for testing)
// ---------------------------------------------------------------------------

export type AiBackend = "vertex" | "google-ai" | "dummy";

export const GEMINI_MODEL = "gemini-2.5-flash-image";
export const GEMINI_CHAT_MODEL = "gemini-3.1-pro-preview";

export function getAiBackend(): AiBackend {
  const raw = process.env.AI_BACKEND?.toLowerCase();
  if (raw === "vertex" || raw === "google-ai" || raw === "dummy") return raw;
  if (process.env.GEMINI_API_KEY) return "google-ai";
  return "dummy";
}

// Jimp is a devDependency (emulator-only).
// It is lazy-imported inside dummyProcess() to avoid crashing in production.

async function loadDummyDeps() {
  const { Jimp, loadFont } = await import("jimp");
  const { SANS_32_WHITE } = await import("jimp/fonts");
  return { Jimp, loadFont, SANS_32_WHITE };
}

/**
 * Dummy image processing: overlay prompt as white text on the image.
 * Used when no AI backend is configured (emulator only).
 */
export async function dummyProcess(
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
      location: process.env.AI_REGION ?? "europe-west1",
    });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  return new GoogleGenAI({ apiKey });
}

export async function geminiProcess(
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

/**
 * Create a GenAI client for the given backend. Exposed for use by the chat
 * function which needs lower-level access (streaming, token counting).
 */
export async function createGenAIClient(backend: "google-ai" | "vertex") {
  const GoogleGenAI = await loadGenAI();
  return createGenAI(GoogleGenAI, backend);
}
