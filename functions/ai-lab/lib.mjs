// Shared utilities for local AI image-editing experiments.
//
// Run with Node 22+ from the repo root. Dependencies (sharp, @google/genai)
// resolve from functions/node_modules, so `npm install` in functions/ is the
// only prerequisite. Nothing here is deployed — firebase.json ignores ai-lab.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

// Mirrors GEMINI_MODEL in functions/src/ai.ts.
export const GEMINI_MODEL = "gemini-2.5-flash-image";

// Production dot-grid parameters (see MaskingCanvas.vue).
export const DOT_SPACING = 15;
export const DOT_RADIUS = 2.5;
export const MAGENTA = "#FF00FF";

const LAB_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(LAB_DIR, "..", "..");

// --------------------------------------------------------------------------
// Vertex AI client
// --------------------------------------------------------------------------

// Mirrors functions/src/ai.ts (vertex backend): the lab talks to Gemini
// through Vertex AI using Application Default Credentials. Run
// `gcloud auth application-default login` once, then set GOOGLE_CLOUD_PROJECT
// (or rely on the `default` project in .firebaserc).
export function getProject() {
  const fromEnv =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT;
  if (fromEnv) return fromEnv;

  const firebaseRc = path.join(REPO_ROOT, ".firebaserc");
  if (existsSync(firebaseRc)) {
    try {
      const def = JSON.parse(readFileSync(firebaseRc, "utf8"))?.projects
        ?.default;
      if (def) return def;
    } catch {
      // fall through to the error below
    }
  }
  throw new Error(
    "GCP project not found. Set GOOGLE_CLOUD_PROJECT or add a default " +
      "project to .firebaserc.",
  );
}

export function getLocation() {
  return process.env.AI_REGION || "global";
}

let genai;
function client() {
  genai ??= new GoogleGenAI({
    vertexai: true,
    project: getProject(),
    location: getLocation(),
  });
  return genai;
}

/**
 * One image-generation call. `images` are Buffers sent after the prompt, in
 * order, mirroring how the Cloud Function builds its requests (ai.ts).
 * Returns { image, text } — `image` is undefined if the model returned none.
 */
export async function generateImage({ prompt, images = [], model }) {
  const parts = [{ text: prompt }];
  for (const buf of images) {
    parts.push({
      inlineData: {
        mimeType: "image/webp",
        data: (await toWebp(buf)).toString("base64"),
      },
    });
  }
  const response = await client().models.generateContent({
    model: model || GEMINI_MODEL,
    contents: [{ role: "user", parts }],
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });

  const out = response.candidates?.[0]?.content?.parts ?? [];
  let image;
  const texts = [];
  for (const part of out) {
    if (part.inlineData?.data && !image) {
      image = Buffer.from(part.inlineData.data, "base64");
    }
    if (part.text) texts.push(part.text);
  }
  return { image, text: texts.join("\n") };
}

// --------------------------------------------------------------------------
// Image primitives (sharp)
// --------------------------------------------------------------------------

export const loadImage = (file) => readFile(file);

export const toWebp = (buffer) =>
  sharp(buffer).webp({ quality: 90 }).toBuffer();

export async function imageSize(buffer) {
  const { width, height } = await sharp(buffer).metadata();
  return { width, height };
}

export const grayscale = (buffer) =>
  sharp(buffer).grayscale().png().toBuffer();

/** Flat colour image; defaults match the Cloud Function's swatch. */
export const colorSwatch = (hex, width = 256, height = 256) =>
  sharp({ create: { width, height, channels: 3, background: hex } })
    .png()
    .toBuffer();

/**
 * Whole-image colour/material reference: multiply the paint colour over the
 * CLEAN source so the model sees how the colour reads under the room's
 * lighting, shadows and texture — the paint shown in multiple natural ways
 * rather than as one flat value. Mirrors the production paint pipeline
 * (processImpression.ts).
 */
export async function buildColorReference(source, hex) {
  const { width, height } = await imageSize(source);
  return sharp(source)
    .composite([
      {
        input: { create: { width, height, channels: 3, background: hex } },
        blend: "multiply",
      },
    ])
    .png()
    .toBuffer();
}

// Bundled reference-room scenes (functions/reference/) that show paintable
// surfaces (wall, ceiling, wood) in grayscale. The bright (`room.png`) and dim
// (`room-dark.png`) scenes are a dynamic switch — a single reference is chosen
// by the paint colour's luminance so the colour reads naturally rather than
// crushed (dark colours on a bright room) or washed out (light colours on a
// dim room).
const REFERENCE_DIR = path.join(REPO_ROOT, "functions", "reference");
const ROOM_REFERENCE = { light: "room.png", dark: "room-dark.png" };

// BT.709 perceived luminance on a 0–255 scale; below the threshold a colour
// uses the dim reference room. Mirrors temp.local/index.html.
const LUMINANCE_THRESHOLD = 110;

export function luminance(hex) {
  const n = parseInt(hex.replace(/^#/, ""), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Pick the reference room ("light" or "dark") for a paint colour. */
export function pickRoomVariant(hex) {
  return luminance(hex) < LUMINANCE_THRESHOLD ? "dark" : "light";
}

/**
 * Preview the paint colour on a single reference room: multiply the colour
 * over the grayscale `room.png` (bright) or `room-dark.png` (dim) scene so the
 * model sees the colour on real wall/ceiling/wood surfaces. `variant` defaults
 * to the luminance-based switch (`pickRoomVariant`) but can be forced.
 */
export async function buildRoomReference(hex, variant = pickRoomVariant(hex)) {
  const file = ROOM_REFERENCE[variant] ?? ROOM_REFERENCE.light;
  const base = await readFile(path.join(REFERENCE_DIR, file));
  const { width, height } = await imageSize(base);
  return sharp(base)
    .composite([
      {
        input: { create: { width, height, channels: 3, background: hex } },
        blend: "multiply",
      },
    ])
    .png()
    .toBuffer();
}

/** Transparent layer with a grid of filled circles. */
export async function dotGrid(
  width,
  height,
  { spacing = DOT_SPACING, radius = DOT_RADIUS, color = MAGENTA } = {},
) {
  const circles = [];
  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      circles.push(`<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}"/>`);
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" ` +
    `height="${height}">${circles.join("")}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Composite an opaque `layer` over `base`, but only where `mask` is white
 * (white = affected area, black = keep base). Layer and mask are resized to
 * the base dimensions. The layer must be opaque — its alpha is replaced by
 * the mask.
 */
export async function compositeMasked(base, layer, mask) {
  const { width, height } = await imageSize(base);
  const maskGray = await sharp(mask)
    .resize(width, height)
    .toColourspace("b-w")
    .png()
    .toBuffer();
  const layerMasked = await sharp(
    await sharp(layer).resize(width, height).removeAlpha().png().toBuffer(),
  )
    .joinChannel(maskGray)
    .png()
    .toBuffer();
  return sharp(base).composite([{ input: layerMasked }]).png().toBuffer();
}

// --------------------------------------------------------------------------
// Composite builders mirroring the production client (MaskingCanvas.vue)
// --------------------------------------------------------------------------

/**
 * Paint-mode composite: masked area desaturated in place + magenta dot grid.
 * This is what the app currently uploads for mode: "paint".
 */
export async function buildPaintComposite(source, mask, dotOptions = {}) {
  const { width, height } = await imageSize(source);
  const gray = await grayscale(source);
  const dots = await dotGrid(width, height, dotOptions);
  const marker = await sharp(gray)
    .composite([{ input: dots }])
    .png()
    .toBuffer();
  return compositeMasked(source, marker, mask);
}

/** Remove-mode composite: masked area hidden under solid magenta. */
export async function buildSolidComposite(source, mask, color = MAGENTA) {
  const { width, height } = await imageSize(source);
  return compositeMasked(source, await colorSwatch(color, width, height), mask);
}

// --------------------------------------------------------------------------
// Output helpers
// --------------------------------------------------------------------------

/** Create functions/ai-lab/out/<name>-<timestamp>/ (out/ is git-ignored). */
export async function makeOutDir(name) {
  const stamp = new Date()
    .toISOString()
    .replace(/[:T]/g, "-")
    .slice(0, 19);
  const dir = path.join(LAB_DIR, "out", `${name}-${stamp}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function save(dir, name, data) {
  const file = path.join(dir, name);
  await writeFile(file, data);
  console.log(`  wrote ${path.relative(process.cwd(), file)}`);
  return file;
}
