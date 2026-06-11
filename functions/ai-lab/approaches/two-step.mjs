// Two-generation experiment: split "paint" and "compose" into separate calls.
//
// Step 1 (paint):   marked composite + swatch → fill the marked area with the
//                   flat target colour, no lighting realism asked for yet.
// Step 2 (compose): original photo + step-1 result → harmonise the repainted
//                   area (lighting, shadows, texture) against the original.
//
// The hypothesis: each call has one simple job, so colour fidelity and
// localization (step 1) don't compete with photorealism (step 2).

import {
  buildPaintComposite,
  colorSwatch,
  generateImage,
  loadImage,
  makeOutDir,
  save,
} from "../lib.mjs";

export default async function twoStep(args) {
  if (!args.source || !args.mask) {
    throw new Error("two-step needs --source and --mask");
  }
  const outDir = await makeOutDir("two-step");

  const source = await loadImage(args.source);
  const composite = await buildPaintComposite(
    source,
    await loadImage(args.mask),
    {
      ...(args.spacing ? { spacing: Number(args.spacing) } : {}),
      ...(args.radius ? { radius: Number(args.radius) } : {}),
    },
  );
  await save(outDir, "step1-composite.png", composite);
  const swatch = await colorSwatch(args.color);
  await save(outDir, "swatch.png", swatch);

  const step1Prompt =
    `The first image is a photo in which the area to repaint has been ` +
    `desaturated to grayscale and marked with a grid of magenta dots. ` +
    `The second image is the paint colour (${args.color}). Fill the dotted ` +
    `grayscale area with this flat colour, removing all dots. Keeping the ` +
    `result realistic does not matter yet. Change nothing else.`;
  await save(outDir, "step1-prompt.txt", step1Prompt);

  const step1 = await generateImage({
    prompt: step1Prompt,
    images: [composite, swatch],
    model: args.model,
  });
  if (step1.text) await save(outDir, "step1-response.txt", step1.text);
  if (!step1.image) {
    throw new Error("Step 1 returned no image (see step1-response.txt)");
  }
  await save(outDir, "step1-result.webp", step1.image);

  const step2Prompt =
    `The first image is the original photo. The second image is the same ` +
    `photo with one area repainted in flat ${args.color}. Make the ` +
    `repainted area look naturally painted: apply the original photo's ` +
    `lighting, shadows and surface relief to it while keeping its ` +
    `${args.color} paint colour. Change nothing outside the repainted area.`;
  await save(outDir, "step2-prompt.txt", step2Prompt);

  const step2 = await generateImage({
    prompt: step2Prompt,
    images: [source, step1.image],
    model: args.model,
  });
  if (step2.text) await save(outDir, "step2-response.txt", step2.text);
  if (!step2.image) {
    throw new Error("Step 2 returned no image (see step2-response.txt)");
  }
  await save(outDir, "result.webp", step2.image);
}
