// Replicates the production paint pipeline (MaskingCanvas.vue composite +
// ai.ts prompt): dotted-grayscale composite + colour swatch, one generation.
// Use this as the baseline to compare other approaches against.

import {
  buildPaintComposite,
  colorSwatch,
  generateImage,
  loadImage,
  makeOutDir,
  save,
} from "../lib.mjs";

export default async function current(args) {
  const outDir = await makeOutDir("current");

  let composite;
  if (args.composite) {
    composite = await loadImage(args.composite);
  } else {
    if (!args.source || !args.mask) {
      throw new Error("current needs --source and --mask (or --composite)");
    }
    composite = await buildPaintComposite(
      await loadImage(args.source),
      await loadImage(args.mask),
      {
        ...(args.spacing ? { spacing: Number(args.spacing) } : {}),
        ...(args.radius ? { radius: Number(args.radius) } : {}),
      },
    );
    await save(outDir, "composite.png", composite);
  }

  const swatch = await colorSwatch(args.color);
  await save(outDir, "swatch.png", swatch);

  // Keep in sync with functions/src/ai.ts when experimenting.
  const prompt =
    args.prompt ??
    `The first image is a photo in which the area to repaint has been ` +
      `desaturated to grayscale and marked with a grid of magenta dots. ` +
      `The second image is the paint colour (${args.color}). Repaint the ` +
      `dotted grayscale area in this colour, removing all dots. ` +
      `Change nothing else.`;
  await save(outDir, "prompt.txt", prompt);

  const { image, text } = await generateImage({
    prompt,
    images: [composite, swatch],
    model: args.model,
  });
  if (text) await save(outDir, "response.txt", text);
  if (!image) throw new Error("Model returned no image (see response.txt)");
  await save(outDir, "result.webp", image);
}
