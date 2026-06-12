// Replicates the production paint pipeline (MaskingCanvas.vue composite +
// ai.ts prompt): dotted-grayscale composite + whole-image colour/material
// reference (the paint colour multiplied over the clean source, showing it
// in multiple natural ways), one generation. Use this as the baseline to
// compare other approaches against.

import {
  buildColorReference,
  buildPaintComposite,
  generateImage,
  loadImage,
  makeOutDir,
  save,
} from "../lib.mjs";

export default async function current(args) {
  const outDir = await makeOutDir("current");

  if (!args.source) {
    throw new Error("current needs --source to build the colour reference");
  }
  const source = await loadImage(args.source);

  let composite;
  if (args.composite) {
    composite = await loadImage(args.composite);
  } else {
    if (!args.mask) {
      throw new Error("current needs --source and --mask (or --composite)");
    }
    composite = await buildPaintComposite(source, await loadImage(args.mask), {
      ...(args.spacing ? { spacing: Number(args.spacing) } : {}),
      ...(args.radius ? { radius: Number(args.radius) } : {}),
    });
    await save(outDir, "composite.png", composite);
  }

  const reference = await buildColorReference(source, args.color);
  await save(outDir, "reference.png", reference);

  // Keep in sync with functions/src/ai.ts when experimenting.
  const prompt =
    args.prompt ??
    `The first image is a photo in which the area to repaint has been ` +
      `desaturated to grayscale and marked with a grid of magenta dots. ` +
      `The second image shows the same room with the target paint colour ` +
      `(${args.color}) applied across the entire image as a colour and ` +
      `material reference. Repaint the dotted grayscale area so it matches ` +
      `the colour and finish in the second image, removing all dots and ` +
      `preserving the room's existing lighting, shadows, perspective and ` +
      `surface texture. Change nothing else.`;
  await save(outDir, "prompt.txt", prompt);

  const { image, text } = await generateImage({
    prompt,
    images: [composite, reference],
    model: args.model,
  });
  if (text) await save(outDir, "response.txt", text);
  if (!image) throw new Error("Model returned no image (see response.txt)");
  await save(outDir, "result.webp", image);
}
