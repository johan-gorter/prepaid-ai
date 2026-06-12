// Paint pipeline variant of `current`: instead of multiplying the colour over
// the clean source photo, preview it on a dedicated reference room
// (functions/reference/room.png or room-dark.png) — real wall/ceiling/wood
// surfaces — and send it as the colour/material reference alongside the
// dotted-grayscale composite. The bright/dim room is chosen by the colour's
// luminance (see pickRoomVariant).
//
// The hypothesis: a consistent reference scene that already shows the colour
// on the surfaces being painted grounds the model better than the source
// photo tinted with one flat multiply.

import {
  buildPaintComposite,
  buildRoomReference,
  generateImage,
  loadImage,
  makeOutDir,
  pickRoomVariant,
  save,
} from "../lib.mjs";

export default async function reference(args) {
  const outDir = await makeOutDir("reference");

  let composite;
  if (args.composite) {
    composite = await loadImage(args.composite);
  } else {
    if (!args.source || !args.mask) {
      throw new Error("reference needs --source and --mask (or --composite)");
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

  const variant = pickRoomVariant(args.color);
  console.log(`  using ${variant} reference room for ${args.color}`);
  const reference = await buildRoomReference(args.color, variant);
  await save(outDir, `reference-${variant}.png`, reference);

  const prompt =
    args.prompt ??
    `The first image is a photo in which the area to repaint has been ` +
      `desaturated to grayscale and marked with a grid of magenta dots. ` +
      `The second image is a reference room showing the target paint colour ` +
      `(${args.color}) applied to walls, ceiling and wood. Repaint the dotted ` +
      `grayscale area so it matches the colour and finish shown in the ` +
      `reference room, removing all dots and preserving the photo's existing ` +
      `lighting, shadows, perspective and surface texture. Change nothing else.`;
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
