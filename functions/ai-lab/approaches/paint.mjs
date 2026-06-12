// The experiment winner (2026-06-12), parameterized for future tweaking:
// one-shot masked repaint on nano banana 2.
//
// - Marking: magenta checkerboard at 50% coverage over the ORIGINAL colours.
//   Coverage is the colour-commitment dial: at 50% the model must repaint
//   (it cannot "restore" materials it can barely see), while the geometry
//   stays readable between the squares. Dots (~5%) and quarter checker (25%)
//   both let the model keep wood/material colours. Tweak with --variant,
//   --cell, --coverage, --spacing, --radius.
// - Colour: nano banana renders paint consistently darker than asked, so the
//   colour sent to the model (prompt hex + tinted reference room) is
//   lightened toward white with --lighten (0..1).
// - Model: gemini-2.5-flash-image cannot do this edit at all (no-ops);
//   nano banana 2 is required. --model overrides.
//
// Saves everything sent to the model (composite + reference + prompt) next
// to the result so runs are fully reproducible.

import {
  buildMarkedComposite,
  buildRoomReference,
  generateImage,
  lightenColor,
  loadImage,
  makeOutDir,
  pickRoomVariant,
  save,
} from "../lib.mjs";

const NANO_BANANA_2 = "gemini-3-pro-image-preview";

const MARKING_DESCRIPTION = {
  checker:
    `is covered by a magenta checkerboard; the original surfaces are ` +
    `partly visible between the magenta squares`,
  dots:
    `is marked with a grid of small magenta dots; the original surfaces ` +
    `remain visible between the dots`,
  grayscale:
    `has been desaturated to grayscale and marked with a grid of small ` +
    `magenta dots`,
  solid: `is covered by an opaque magenta fill`,
};

export default async function paint(args) {
  const outDir = await makeOutDir("paint");
  const variant = args.variant ?? "checker";

  let composite;
  if (args.composite) {
    composite = await loadImage(args.composite);
  } else {
    if (!args.source || !args.mask) {
      throw new Error("paint needs --source and --mask (or --composite)");
    }
    composite = await buildMarkedComposite(
      await loadImage(args.source),
      await loadImage(args.mask),
      {
        variant,
        ...(args.spacing ? { spacing: Number(args.spacing) } : {}),
        ...(args.radius ? { radius: Number(args.radius) } : {}),
        ...(args.cell ? { cell: Number(args.cell) } : {}),
        ...(args.coverage ? { coverage: args.coverage } : {}),
      },
    );
  }
  await save(outDir, "composite.png", composite);

  const lighten = Number(args.lighten ?? 0);
  const color = lighten ? lightenColor(args.color, lighten) : args.color;
  console.log(
    `  paint colour ${args.color} -> sent as ${color} (lighten ${lighten})`,
  );

  const roomVariant = pickRoomVariant(color);
  const reference = await buildRoomReference(color, roomVariant);
  await save(outDir, `reference-${roomVariant}.png`, reference);

  const marking = MARKING_DESCRIPTION[variant] ?? MARKING_DESCRIPTION.checker;
  const markingNoun =
    variant === "checker"
      ? "checkerboard"
      : variant === "solid"
        ? "magenta fill"
        : "dots";
  const prompt =
    args.prompt ??
    `The first image is a photo in which the area to repaint ${marking}. ` +
      `Paint every surface under the ${markingNoun} - whatever its ` +
      `material or original colour - in the paint colour shown in the ` +
      `second image (${color}). Reconstruct the covered geometry exactly ` +
      `as it appears in the photo: every structural element stays in ` +
      `place, painted in this same single colour, varied only by lighting. ` +
      `Light fixtures and other objects in front of the painted surfaces ` +
      `are not painted: reconstruct them crisp with their original ` +
      `colours. No magenta remains, and everything outside the marked ` +
      `area stays unchanged.`;
  await save(outDir, "prompt.txt", prompt);

  const { image, text } = await generateImage({
    prompt,
    images: [composite, reference],
    model: args.model ?? NANO_BANANA_2,
  });
  if (text) await save(outDir, "response.txt", text);
  if (!image) throw new Error("Model returned no image (see response.txt)");
  await save(outDir, "result.webp", image);
}
