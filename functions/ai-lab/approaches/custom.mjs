// Free-form experiment: send any prompt + any images, in the given order.
// Useful for quickly testing prompt variants against a composite downloaded
// from the Storage emulator, or any ad-hoc idea.

import { generateImage, loadImage, makeOutDir, save } from "../lib.mjs";

export default async function custom(args) {
  if (!args.prompt) throw new Error("custom needs --prompt");
  const outDir = await makeOutDir("custom");

  const images = [];
  for (const file of args.image ?? []) {
    images.push(await loadImage(file));
  }
  await save(outDir, "prompt.txt", args.prompt);

  const { image, text } = await generateImage({
    prompt: args.prompt,
    images,
    model: args.model,
  });
  if (text) await save(outDir, "response.txt", text);
  if (!image) throw new Error("Model returned no image (see response.txt)");
  await save(outDir, "result.webp", image);
}
