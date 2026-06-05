import { onDocumentCreated } from "firebase-functions/v2/firestore";
import sharp from "sharp";
import { bucket, db } from "./admin.js";
import { dummyProcess, geminiProcess, getAiBackend } from "./ai.js";
import { deductCredits } from "./balance.js";
import { imageGenerationCredits } from "./credits.js";
import { FUNCTIONS_REGION } from "./region.js";
import { hexToRgb, storagePathFromUrl } from "./utils.js";

export const processImpression = onDocumentCreated(
  {
    document:
      "users/{userId}/renovations/{renovationId}/impressions/{impressionId}",
    region: FUNCTIONS_REGION,
    secrets: ["GEMINI_API_KEY", "AI_BACKEND", "AI_REGION"],
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
    const mode = impressionData.mode as string | undefined;
    const paintColor = impressionData.paintColor as string | undefined;

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

      // Paint mode: build a whole-image colour/material reference by
      // multiplying the chosen paint colour over the CLEAN source (not the
      // magenta composite). Passed to Gemini as a second image so it sees how
      // the colour reads under the room's lighting. Kept in-memory only.
      let referenceBuffer: Buffer | undefined;
      if (mode === "paint" && paintColor) {
        const cleanPath =
          sourceImagePath ?? storagePathFromUrl(sourceImageUrl ?? "");
        const [cleanBuffer] = await bucket.file(cleanPath).download();
        const meta = await sharp(cleanBuffer).metadata();
        const width = meta.width ?? 1024;
        const height = meta.height ?? 1024;
        referenceBuffer = Buffer.from(
          await sharp(cleanBuffer)
            .composite([
              {
                input: {
                  create: {
                    width,
                    height,
                    channels: 3,
                    background: hexToRgb(paintColor),
                  },
                },
                blend: "multiply",
              },
            ])
            .webp({ quality: 80 })
            .toBuffer(),
        );
      }

      let resultBuffer: Buffer;
      const backend = getAiBackend();
      console.log(`Processing with backend: ${backend}`);

      if (backend === "dummy") {
        // Fetch prior prompts for this renovation to render a complete log
        const priorSnap = await db
          .collection(`users/${userId}/renovations/${renovationId}/impressions`)
          .orderBy("createdAt", "asc")
          .get();
        const priorPrompts = priorSnap.docs
          .filter((d) => d.id !== impressionId)
          .map((d) => d.data().prompt as string)
          .filter(Boolean);

        resultBuffer = await dummyProcess(fileBuffer, prompt, priorPrompts);
      } else {
        resultBuffer = await geminiProcess(
          backend,
          fileBuffer,
          prompt,
          referenceBuffer,
        );
      }

      // Re-encode as lossy WebP to reduce file size
      resultBuffer = Buffer.from(
        await sharp(resultBuffer).webp({ quality: 80 }).toBuffer(),
      );

      // Upload result to Storage
      const resultPath = `users/${userId}/results/${renovationId}/${impressionId}.webp`;
      const resultFile = bucket.file(resultPath);
      await resultFile.save(resultBuffer, {
        metadata: { contentType: "image/webp" },
      });

      await impressionRef.update({
        status: "completed",
        resultImagePath: resultPath,
      });

      // Clean up composite image — it was only needed as AI input
      if (compositeImagePath) {
        try {
          await bucket.file(compositeImagePath).delete();
        } catch {
          // Ignore — file may already be gone
        }
      }

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
