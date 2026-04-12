import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { bucket, db } from "./admin.js";
import { dummyProcess, geminiProcess, getAiBackend } from "./ai.js";
import { deductCredits } from "./balance.js";
import { imageGenerationCredits } from "./credits.js";
import { storagePathFromUrl } from "./utils.js";

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
