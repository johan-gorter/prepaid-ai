import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
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
 * Used when NANO_BANANA_API_KEY is not configured.
 */
async function dummyProcess(
  imageBuffer: Buffer,
  prompt: string,
): Promise<Buffer> {
  // Extract PNG chunks to read/write metadata
  const chunks = extractChunks(new Uint8Array(imageBuffer));

  // Read existing prompt log and append current prompt
  const promptLog = readPromptLog(chunks);
  promptLog.push(prompt);

  // Use jimp to overlay text on the image
  const image = await Jimp.read(imageBuffer);
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

export const processImpression = onDocumentCreated(
  "users/{userId}/renovations/{renovationId}/impressions/{impressionId}",
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

    const impressionRef = db.doc(
      `users/${userId}/renovations/${renovationId}/impressions/${impressionId}`,
    );

    try {
      await impressionRef.update({ status: "processing" });

      // Download source image from Storage
      const storagePath =
        sourceImagePath ?? storagePathFromUrl(sourceImageUrl ?? "");
      const [fileBuffer] = await bucket.file(storagePath).download();

      let resultBuffer: Buffer;

      const nanoBananaKey = process.env.NANO_BANANA_API_KEY;
      if (nanoBananaKey) {
        // TODO: Call real Nano Banana inpainting API
        // For now, fall through to dummy implementation
        console.warn(
          "Nano Banana API integration not yet implemented, using dummy",
        );
        resultBuffer = await dummyProcess(fileBuffer, prompt);
      } else {
        console.warn(
          "NANO_BANANA_API_KEY not configured, using dummy jimp implementation",
        );
        resultBuffer = await dummyProcess(fileBuffer, prompt);
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
