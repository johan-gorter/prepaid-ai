import { onDocumentCreated } from "firebase-functions/v2/firestore";
import sharp from "sharp";
import { bucket, db } from "./admin.js";
import { dummyProcess, geminiProcess, getAiBackend } from "./ai.js";
import { deductCredits } from "./balance.js";
import {
  ACTION_CREDITS,
  imageGenerationCredits,
  type RenovationAction,
} from "./credits.js";
import { FUNCTIONS_REGION } from "./region.js";
import { storagePathFromUrl } from "./utils.js";

export const processImpression = onDocumentCreated(
  {
    document:
      "users/{userId}/renovations/{renovationId}/impressions/{impressionId}",
    region: FUNCTIONS_REGION,
    secrets: ["GEMINI_API_KEY", "AI_BACKEND", "AI_REGION"],
    // Paint mode runs on the slower gemini-3-pro-image-preview model.
    timeoutSeconds: 300,
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
    const materialImagePath = impressionData.materialImagePath as
      | string
      | undefined;
    const action = impressionData.action as string | undefined;

    // Charge the per-action price (docs/viral-flow.md §10): remove = 5,
    // colour change = 10, free edit = 10. Older impression docs predate the
    // `action` field, so fall back to the flat image-generation cost for them.
    const requiredCredits =
      action && action in ACTION_CREDITS
        ? ACTION_CREDITS[action as RenovationAction]
        : imageGenerationCredits();

    const impressionRef = db.doc(
      `users/${userId}/renovations/${renovationId}/impressions/${impressionId}`,
    );

    // Check balance before processing
    const userRef = db.doc(`users/${userId}`);
    const userBalanceSnap = await userRef.get();
    const currentBalance: number = userBalanceSnap.data()?.balance ?? 0;

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

      // Paint mode: the composite already shows the masked area covered by
      // the magenta checkerboard. geminiProcess lightens the hex, names it
      // in the prompt, and switches to the paint model.
      const paint =
        mode === "paint" && paintColor ? { hex: paintColor } : undefined;

      // Apply-material mode: download the user's material reference photo so it
      // can be sent to Gemini as the second image alongside the marked photo.
      let material: { buffer: Buffer } | undefined;
      if (mode === "material" && materialImagePath) {
        const [materialBuffer] = await bucket.file(materialImagePath).download();
        material = { buffer: materialBuffer };
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
          paint,
          material,
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
        await deductCredits(userId, requiredCredits, "image_generation", {
          renovationId,
          impressionId,
        });
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
