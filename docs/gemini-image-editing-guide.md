# Gemini Image Editing from Firebase Cloud Functions — March 2026

## Setup

- Google Cloud project: `prepaid-ai-dev` (billing enabled)
- Firebase Cloud Functions v2 (Cloud Run-based, Node.js 22, `us-central1`)
- SDK: **`@google/genai`** (v1.46.0+)

## Why your previous attempts failed

| What you tried                                               | Why it failed                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `gemini-2.0-flash-exp`                                       | Retired/removed experimental model                                                                                       |
| `gemini-2.0-flash`                                           | Text-only model — never had image output                                                                                 |
| `gemini-2.5-flash` + `responseModalities: ["TEXT", "IMAGE"]` | This is the **text reasoning** model. You need **`gemini-2.5-flash-image`** (note the `-image` suffix)                   |
| `@google-cloud/vertexai` SDK — all models 404                | Legacy SDK, no longer receives Gemini 2.0+ features. See [Vertex AI 404 troubleshooting](#vertex-ai-404-troubleshooting) |
| Google AI Studio free tier exhausted                         | Resets daily (500 req/day for `gemini-2.5-flash-image`). A paid API key has higher limits                                |

## Current image models (March 2026)

| Marketing name      | Model ID                         | Notes                                                                   |
| ------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| **Nano Banana**     | `gemini-2.5-flash-image`         | Stable. Free tier: 500 req/day. Best starting point                     |
| **Nano Banana 2**   | `gemini-3.1-flash-image-preview` | Released Feb 26 2026. Highest quality at Flash speed. Paid key required |
| **Nano Banana Pro** | `gemini-3-pro-image-preview`     | Pro-tier quality, 4K support, "thinking" mode. Paid only                |

All three support image generation and editing via the same `generateContent` API with `responseModalities: ["TEXT", "IMAGE"]`.

### SDK migration

`@google/generative-ai` and `@google-cloud/vertexai` are previous-generation SDKs that no longer receive Gemini 2.0+ features. Replace both with:

```bash
npm install @google/genai
# Remove legacy packages:
npm uninstall @google/generative-ai @google-cloud/vertexai
```

## Approach: red overlay hint

These models don't have an explicit mask/inpainting API. Instead, they handle editing conversationally — you pass an image + a text prompt describing what to change. The model understands spatial context from the prompt.

To guide the model to a specific region, **composite a semi-transparent red overlay onto the source image** where the mask is white. This gives the model a single image where the edit area is visually obvious while the original content remains visible underneath (preserving context for natural blending).

### Why this works well

- **Single image = zero spatial ambiguity.** Sending source + mask as two separate images is unreliable — the model sometimes misinterprets which region maps where.
- **Semi-transparent overlay preserves context.** The model can see what's under the red tint, which helps it blend the new content naturally. Solid fills (black, green) destroy that context.
- **Simple prompt contract.** Always the same instruction pattern: _"Edit the area highlighted in red: [description]. Keep everything else unchanged."_

### Implementation

#### Dependencies

```json
{
  "dependencies": {
    "@google/genai": "^1.46.0",
    "firebase-functions": "^6.0.0",
    "firebase-admin": "^12.0.0",
    "sharp": "^0.33.0"
  }
}
```

#### Compositing the red hint overlay

```typescript
import sharp from "sharp";

/**
 * Composites a semi-transparent red overlay onto the source image
 * in the areas where the mask is white.
 *
 * @param sourceBuffer - JPEG or PNG source image
 * @param maskBuffer   - PNG mask (white = edit area, black = keep)
 * @param opacity      - Overlay opacity 0–255 (default 100 ≈ 40%)
 * @returns PNG buffer with the red hint baked in
 */
async function compositeRedHint(
  sourceBuffer: Buffer,
  maskBuffer: Buffer,
  opacity = 100,
): Promise<Buffer> {
  const { width, height } = (await sharp(sourceBuffer).metadata()) as {
    width: number;
    height: number;
  };

  // Resize mask to match source dimensions (in case they differ)
  const resizedMask = await sharp(maskBuffer)
    .resize(width, height, { fit: "fill" })
    .grayscale()
    .toBuffer();

  // Create a solid red image at the target opacity
  const redLayer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: opacity / 255 },
    },
  })
    .png()
    .toBuffer();

  // Use the mask as an alpha channel on the red layer:
  // white in mask → red overlay visible, black → transparent
  const maskedRed = await sharp(redLayer)
    .composite([
      {
        input: resizedMask,
        blend: "dest-in", // keep red only where mask is white
      },
    ])
    .png()
    .toBuffer();

  // Overlay the masked red onto the source image
  return sharp(sourceBuffer)
    .composite([{ input: maskedRed, blend: "over" }])
    .png()
    .toBuffer();
}
```

#### Cloud Function

```typescript
import { onRequest } from "firebase-functions/v2/https";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const editImage = onRequest(
  {
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "1GiB",
  },
  async (req, res) => {
    try {
      const {
        prompt, // e.g. "Replace with a golden retriever"
        sourceImageBase64, // base64-encoded JPEG/PNG (no data URI prefix)
        maskImageBase64, // optional base64 PNG mask (white = edit area)
        sourceMimeType = "image/png",
      } = req.body;

      let imageToSend: string;
      let editPrompt: string;

      if (maskImageBase64) {
        // Composite the red hint overlay
        const sourceBuffer = Buffer.from(sourceImageBase64, "base64");
        const maskBuffer = Buffer.from(maskImageBase64, "base64");
        const hinted = await compositeRedHint(sourceBuffer, maskBuffer);
        imageToSend = hinted.toString("base64");
        editPrompt =
          `Edit the area highlighted in red: ${prompt}. ` +
          `Keep everything else unchanged. Remove the red overlay in the output.`;
      } else {
        // No mask — pure prompt-based edit
        imageToSend = sourceImageBase64;
        editPrompt = prompt;
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [
          {
            role: "user",
            parts: [
              { text: editPrompt },
              { inlineData: { mimeType: "image/png", data: imageToSend } },
            ],
          },
        ],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          // Use ["IMAGE"] if you don't want text commentary
        },
      });

      // Extract image from response
      const parts = response.candidates?.[0]?.content?.parts;
      if (!parts) {
        res.status(500).json({ error: "Empty response from model" });
        return;
      }

      let resultImage: string | null = null;
      let resultText: string | null = null;

      for (const part of parts) {
        if (part.inlineData) {
          resultImage = part.inlineData.data; // base64-encoded PNG
        } else if (part.text) {
          resultText = part.text;
        }
      }

      if (!resultImage) {
        res.status(500).json({
          error: "No image in response",
          text: resultText,
        });
        return;
      }

      res.json({
        image: resultImage,
        mimeType: "image/png",
        description: resultText,
      });
    } catch (err: any) {
      console.error("editImage error:", err);
      res.status(500).json({ error: err.message });
    }
  },
);
```

### Using Vertex AI instead of an API key

If you want to use Vertex AI (ADC/service account, no API key), change only the client initialization:

```typescript
const ai = new GoogleGenAI({
  vertexai: true,
  project: "prepaid-ai-dev",
  location: "us-central1",
});
```

Or set environment variables on the Cloud Function:

```
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=prepaid-ai-dev
GOOGLE_CLOUD_LOCATION=us-central1
```

The `generateContent` call stays identical. The Cloud Function's default service account needs `roles/aiplatform.user`.

### Prompt tips

- **Insertion:** _"Edit the area highlighted in red: add a straw hat. Keep everything else unchanged. Remove the red overlay in the output."_
- **Removal:** _"Edit the area highlighted in red: remove the object and fill with the surrounding background. Remove the red overlay."_
- **Style change:** _"Edit the area highlighted in red: make it look like a watercolor painting. Keep everything else as-is. Remove the red overlay."_
- The instruction to _"remove the red overlay"_ ensures the output is clean.

### Model selection guide

| Use case                           | Model                            | Why                            |
| ---------------------------------- | -------------------------------- | ------------------------------ |
| Development / prototyping          | `gemini-2.5-flash-image`         | Free tier, stable, fast        |
| Production (quality matters)       | `gemini-3.1-flash-image-preview` | Best quality/speed ratio, paid |
| Max quality (complex compositions) | `gemini-3-pro-image-preview`     | Thinking mode, 4K, paid        |

All three use the exact same API and code — just swap the model string.

## Vertex AI 404 troubleshooting

If you still need Vertex AI and are getting 404s, check in this order:

1. **Wrong SDK.** `@google-cloud/vertexai` doesn't support Gemini 2.0+ image models. Use `@google/genai` with `vertexai: true`.
2. **Wrong model name.** `gemini-2.5-flash` ≠ `gemini-2.5-flash-image`. The `-image` suffix matters.
3. **Retired model.** `gemini-2.0-flash-exp`, `gemini-1.0-pro`, `gemini-3-pro-preview` (retired March 9 2026) all return 404. Check the [retired models list](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions#expandable-1).
4. **Unsupported region.** Not all models are in all regions. `us-central1` has the broadest coverage.
5. **Missing IAM role.** The service account needs `roles/aiplatform.user`:
   ```bash
   gcloud projects add-iam-policy-binding prepaid-ai-dev \
     --member="serviceAccount:SA_EMAIL" \
     --role="roles/aiplatform.user"
   ```
6. **Model not provisioned.** Visit [Vertex AI Studio](https://console.cloud.google.com/vertex-ai/studio) in your project at least once. This triggers model provisioning that doesn't always happen from just enabling the API.
7. **Org policy.** If your project is in a GCP organization, check `constraints/aiplatform.allowedModels`.
8. **Propagation delay.** After enabling `aiplatform.googleapis.com`, wait 5 minutes before retrying.
