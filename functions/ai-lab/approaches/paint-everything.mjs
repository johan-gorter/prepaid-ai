// Step 1 of the two-pass paint idea: send the CLEAN source photo (no mask, no
// dots) with the tinted reference room (functions/reference/room.png or
// room-dark.png, chosen by colour luminance) and ask the model to paint every
// surface in the scene with that one colour. If this pass reliably gives
// ceiling and beams the same paint, step 2 cuts the user's masked area out of
// this result, composites it over the original, and asks the model to fix the
// seams.

import {
  buildRoomReference,
  generateImage,
  loadImage,
  makeOutDir,
  pickRoomVariant,
  save,
} from "../lib.mjs";

export default async function paintEverything(args) {
  if (!args.source) throw new Error("paint-everything needs --source");
  const outDir = await makeOutDir("paint-everything");

  const source = await loadImage(args.source);
  const variant = pickRoomVariant(args.color);
  console.log(`  using ${variant} reference room for ${args.color}`);
  const reference = await buildRoomReference(args.color, variant);
  await save(outDir, `reference-${variant}.png`, reference);

  const prompt =
    args.prompt ??
    `The first image is a photo of a scene. The second image is a reference ` +
      `room showing the target paint colour (${args.color}) on walls, ` +
      `ceiling and wood. Paint every surface and object in the first photo ` +
      `with this same paint colour, completely replacing the old colours, ` +
      `like a monochrome art installation. Lighting and shadows still vary ` +
      `the shade naturally.`;
  await save(outDir, "prompt.txt", prompt);

  const { image, text } = await generateImage({
    prompt,
    images: [source, reference],
    model: args.model,
  });
  if (text) await save(outDir, "response.txt", text);
  if (!image) throw new Error("Model returned no image (see response.txt)");
  await save(outDir, "result.webp", image);
}
