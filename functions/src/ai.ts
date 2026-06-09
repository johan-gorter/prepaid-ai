// ---------------------------------------------------------------------------
// AI backend selection: "vertex" | "google-ai" | "dummy"
// Set via environment variable AI_BACKEND. Defaults to "google-ai".
// - "vertex"    — Vertex AI (uses service account auth, no API key needed)
// - "google-ai" — Google AI Studio (uses GEMINI_API_KEY secret)
// - "dummy"     — Sharp text overlay (no AI, for testing)
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

/**
 * Dummy image processing: overlay all prompts as white text on the source image.
 * Uses the actual uploaded image as background. Text is rendered with a dark
 * semi-transparent banner so it's readable on any background.
 * Used when no AI backend is configured (emulator only).
 */
export async function dummyProcess(
  imageBuffer: Buffer,
  prompt: string,
  priorPrompts: string[] = [],
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;

  // Get dimensions from source image
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 800;
  const height = meta.height ?? 600;
  const lineHeight = 36;
  const fontSize = 28;

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const allPrompts = [...priorPrompts, prompt];
  const bannerHeight = allPrompts.length * lineHeight + 20;

  // Build SVG: dark banner + wrapped text lines
  const lines: string[] = [];
  // Semi-transparent dark banner for readability
  lines.push(
    `<rect x="0" y="0" width="${width}" height="${bannerHeight}" fill="rgba(0,0,0,0.6)"/>`,
  );
  let y = lineHeight + 4;
  for (const p of priorPrompts) {
    lines.push(
      `<text x="20" y="${y}" fill="#ccc" font-size="${fontSize}" font-family="sans-serif">${escape(p)}</text>`,
    );
    y += lineHeight;
  }
  lines.push(
    `<text x="20" y="${y}" fill="white" font-size="${fontSize}" font-family="sans-serif" font-weight="bold">${escape(prompt)}</text>`,
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${lines.join("")}</svg>`;

  return Buffer.from(
    await sharp(imageBuffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toBuffer(),
  );
}

// ---------------------------------------------------------------------------
// Gemini image editing — the client sends a pre-composited image with a
// magenta overlay on the edit area. No server-side image processing needed
// except in paint mode, where processImpression supplies two extra images.
// ---------------------------------------------------------------------------

async function loadGenAI() {
  const { GoogleGenAI } = await import("@google/genai");
  return GoogleGenAI;
}

function createGenAI(
  GoogleGenAI: Awaited<ReturnType<typeof loadGenAI>>,
  backend: "google-ai" | "vertex",
  location?: string,
) {
  if (backend === "vertex") {
    return new GoogleGenAI({
      vertexai: true,
      project: process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT,
      location: location ?? process.env.AI_REGION ?? "global",
    });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  return new GoogleGenAI({ apiKey });
}

export interface PaintImages {
  /** Grayscale of the clean source — shows forms and materials only. */
  grayscale: Buffer;
  /** Flat swatch of the chosen paint colour. */
  color: Buffer;
}

export async function geminiProcess(
  backend: "google-ai" | "vertex",
  imageBuffer: Buffer,
  prompt: string,
  paintImages?: PaintImages,
): Promise<Buffer> {
  const GoogleGenAI = await loadGenAI();
  const ai = createGenAI(GoogleGenAI, backend);

  // Parts are read in order, so the prompt refers to image 1/2/3 and the
  // inlineData parts are pushed in that same order.
  const requestParts: Array<Record<string, unknown>> = [];
  if (paintImages) {
    // Paint mode: the solid magenta in image 1 fully hides the old colour so
    // it cannot leak into the result. The grayscale supplies the shapes and
    // materials, the swatch supplies the target colour. The impression doc's
    // prompt is only a timeline label, so it is deliberately not sent.
    requestParts.push({
      text:
        `Image 1 is a photo with an area hidden under magenta. ` +
        `Image 2 is a grayscale of the same photo showing the forms and ` +
        `materials of the hidden area. Image 3 is a paint colour. ` +
        `Replace the magenta area with the forms from image 2, painted in ` +
        `the colour of image 3. Change nothing else.`,
    });
    requestParts.push({
      inlineData: {
        mimeType: "image/webp",
        data: imageBuffer.toString("base64"),
      },
    });
    requestParts.push({
      inlineData: {
        mimeType: "image/webp",
        data: paintImages.grayscale.toString("base64"),
      },
    });
    requestParts.push({
      inlineData: {
        mimeType: "image/webp",
        data: paintImages.color.toString("base64"),
      },
    });
  } else {
    requestParts.push({
      text:
        `Apply the prompt below to the magenta checkered area. ` +
        `Do not include the checkered area in the output.\n\n${prompt}`,
    });
    requestParts.push({
      inlineData: {
        mimeType: "image/webp",
        data: imageBuffer.toString("base64"),
      },
    });
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: requestParts,
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
export async function createGenAIClient(
  backend: "google-ai" | "vertex",
  location?: string,
) {
  const GoogleGenAI = await loadGenAI();
  return createGenAI(GoogleGenAI, backend, location);
}
