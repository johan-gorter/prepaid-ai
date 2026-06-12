// Visual heatmap of where a result differs from the source. The masked area
// is dimmed to grey so outside-mask changes stand out in red — paint
// spilling past the mask edge, hallucinated objects, global tone shifts.
//
//   node functions/ai-lab/tools/diffmap.mjs <result> --source <photo> \
//     --mask <mask> [--out <png>]
//
// Default output: diffmap.png next to the result.
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: "string" },
    mask: { type: "string" },
    out: { type: "string" },
  },
});
const result = positionals[0];
if (!result || !values.source || !values.mask) {
  console.error(
    "Usage: node functions/ai-lab/tools/diffmap.mjs <result> " +
      "--source <photo> --mask <mask> [--out <png>]",
  );
  process.exit(1);
}

const { width, height } = await sharp(values.source).metadata();
const toRaw = (f) =>
  sharp(f).resize(width, height).removeAlpha().raw().toBuffer();
const src = await toRaw(values.source);
const res = await toRaw(result);
const mask = await sharp(values.mask)
  .resize(width, height)
  .toColourspace("b-w")
  .raw()
  .toBuffer();

const out = Buffer.alloc(width * height * 3);
for (let p = 0; p < mask.length; p++) {
  const i = p * 3;
  const d = Math.min(
    255,
    Math.abs(src[i] - res[i]) +
      Math.abs(src[i + 1] - res[i + 1]) +
      Math.abs(src[i + 2] - res[i + 2]),
  );
  const inMask = mask[p] > 127;
  out[i] = inMask ? Math.round(d / 4) : d;
  out[i + 1] = inMask ? Math.round(d / 4) : 0;
  out[i + 2] = inMask ? Math.round(d / 4) : 0;
}
const outFile = values.out ?? path.join(path.dirname(result), "diffmap.png");
await sharp(out, { raw: { width, height, channels: 3 } })
  .png()
  .toFile(outFile);
console.log(`wrote ${outFile} (red = outside-mask change, grey = inside)`);
