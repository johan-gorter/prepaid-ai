// ---------------------------------------------------------------------------
// AI backend selection: "vertex" | "google-ai" | "dummy"
// Set via environment variable AI_BACKEND. Defaults to "google-ai".
// - "vertex"    — Vertex AI (uses service account auth, no API key needed)
// - "google-ai" — Google AI Studio (uses GEMINI_API_KEY secret)
// - "dummy"     — Sharp text overlay (no AI, for testing)
// ---------------------------------------------------------------------------

import {
  buildEditPrompt,
  buildPaintPrompt,
  buildReferencePrompt,
  type ReferenceKind,
} from "./prompts.js";
import { hexToRgb } from "./utils.js";

export type AiBackend = "vertex" | "google-ai" | "dummy";

export const GEMINI_MODEL = "gemini-2.5-flash-image";
// Paint mode needs the stronger image model: gemini-2.5-flash-image
// consistently returns the input unchanged for "repaint the marked area"
// edits, regardless of marking or prompt (ai-lab, 2026-06-12), while
// gemini-3-pro-image-preview (nano banana 2) commits to the colour. Slower
// and more expensive, so paint mode only.
export const GEMINI_PAINT_MODEL = "gemini-3-pro-image-preview";
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
// magenta overlay on the edit area. No server-side image processing needed.
// ---------------------------------------------------------------------------

// Nano banana renders LIGHT paint colours consistently darker than asked,
// while dark colours come back close to the requested value (ai-lab,
// 2026-06-12: light taupe #887360, luminance ≈118, needed the full 20%
// white-blend; dark green #213529, luminance ≈48, rendered true with none).
// The lighten factor therefore ramps from 0 at the dark anchor to the full
// factor at the light anchor.
const PAINT_COLOR_LIGHTEN = 0.2;
const LIGHTEN_RAMP_START = 50;
const LIGHTEN_RAMP_FULL = 120;

/** BT.709 perceived luminance on a 0–255 scale. */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function paintLightenFactor(hex: string): number {
  const t =
    (luminance(hex) - LIGHTEN_RAMP_START) /
    (LIGHTEN_RAMP_FULL - LIGHTEN_RAMP_START);
  return PAINT_COLOR_LIGHTEN * Math.min(1, Math.max(0, t));
}

/** Blend a hex colour toward white by `factor` (0 = unchanged, 1 = white). */
function lightenColor(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  const lift = (c: number) =>
    Math.round(c + (255 - c) * factor)
      .toString(16)
      .padStart(2, "0");
  return `#${lift(r)}${lift(g)}${lift(b)}`;
}

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

export interface PaintInput {
  /** Hex code of the chosen colour, e.g. "#F4F4F0". */
  hex: string;
}

export interface ReferenceInput {
  /** The user's reference photo, sent as the second image. */
  buffer: Buffer;
  /** Which reference flow this is — selects the prompt template. */
  kind: ReferenceKind;
}

export async function geminiProcess(
  backend: "google-ai" | "vertex",
  imageBuffer: Buffer,
  prompt: string,
  paint?: PaintInput,
  reference?: ReferenceInput,
): Promise<Buffer> {
  const GoogleGenAI = await loadGenAI();
  const ai = createGenAI(GoogleGenAI, backend);

  // Parts are read in order, so the prompt refers to first/second image and
  // the inlineData parts are pushed in that same order.
  const requestParts: Array<Record<string, unknown>> = [];
  if (paint) {
    // Paint mode: the masked area arrives covered by a magenta checkerboard
    // at 50% coverage over the ORIGINAL colours. Coverage is the colour-
    // commitment dial (ai-lab, 2026-06-12): with sparser markings (dot
    // grids, 25% checker) the model sees enough of the original surface to
    // "preserve the materials" and leaves wood etc. unpainted, while at 50%
    // it repaints every marked surface and the geometry stays readable
    // between the squares. The colour is named by hex only — nano banana 2
    // paints as accurately from the hex as from a tinted reference image,
    // and edits more surgically without one. The impression doc's prompt is
    // only a timeline label, so it is deliberately not sent.
    const sentColor = lightenColor(paint.hex, paintLightenFactor(paint.hex));
    requestParts.push({
      text: buildPaintPrompt(sentColor),
    });
    requestParts.push({
      inlineData: {
        mimeType: "image/webp",
        data: imageBuffer.toString("base64"),
      },
    });
  } else if (reference) {
    // Reference-image edits (apply material / add furniture): the marked area
    // arrives covered by the same 50% magenta checkerboard as paint (geometry
    // stays readable while the marked area is resurfaced / filled). The user's
    // reference is the SECOND image; the prompt refers to them by position, so
    // push the marked photo first. The kind selects the prompt template.
    requestParts.push({
      text: buildReferencePrompt(reference.kind),
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
        data: reference.buffer.toString("base64"),
      },
    });
  } else {
    requestParts.push({
      text: buildEditPrompt(prompt),
    });
    requestParts.push({
      inlineData: {
        mimeType: "image/webp",
        data: imageBuffer.toString("base64"),
      },
    });
  }

  const response = await ai.models.generateContent({
    model: paint || reference ? GEMINI_PAINT_MODEL : GEMINI_MODEL,
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
