// Quantitative check of a masked-edit result against the clean source.
//
//   node functions/ai-lab/tools/verify.mjs <result> --source <photo> \
//     --mask <mask> [--target <hex>] [--band <out.png>]
//
// Reports, with everything resized to the source dimensions:
//   - mean abs pixel diff OUTSIDE the mask (preservation; ~0 is perfect,
//     ~5/255 is regeneration noise, >10 means something visibly changed)
//   - mean abs pixel diff INSIDE the mask (high = actually repainted)
//   - mean colour INSIDE the mask, vs --target when given
//   - leftover magenta pixels inside the mask (marker removal)
// Also writes a crop of the result around the mask's bounding box for close
// visual inspection (default: band.png next to the result).
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: "string" },
    mask: { type: "string" },
    target: { type: "string" },
    band: { type: "string" },
  },
});
const result = positionals[0];
if (!result || !values.source || !values.mask) {
  console.error(
    "Usage: node functions/ai-lab/tools/verify.mjs <result> " +
      "--source <photo> --mask <mask> [--target <hex>] [--band <out.png>]",
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

let inDiff = 0;
let outDiff = 0;
let inN = 0;
let outN = 0;
let r = 0;
let g = 0;
let b = 0;
let magenta = 0;
let minX = width;
let minY = height;
let maxX = 0;
let maxY = 0;
for (let p = 0; p < mask.length; p++) {
  const i = p * 3;
  const d =
    Math.abs(src[i] - res[i]) +
    Math.abs(src[i + 1] - res[i + 1]) +
    Math.abs(src[i + 2] - res[i + 2]);
  if (mask[p] > 127) {
    inDiff += d;
    inN++;
    r += res[i];
    g += res[i + 1];
    b += res[i + 2];
    if (res[i] > 200 && res[i + 1] < 80 && res[i + 2] > 200) magenta++;
    const x = p % width;
    const y = Math.floor(p / width);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  } else {
    outDiff += d;
    outN++;
  }
}
if (!inN) {
  console.error("Mask is empty — nothing to verify");
  process.exit(1);
}

const hex = (v) =>
  Math.round(v / inN)
    .toString(16)
    .padStart(2, "0");
console.log(`result: ${result}`);
console.log(
  `outside-mask mean abs diff: ${(outDiff / outN / 3).toFixed(2)} (0 = untouched)`,
);
console.log(
  `inside-mask  mean abs diff: ${(inDiff / inN / 3).toFixed(2)} (high = repainted)`,
);
console.log(
  `inside-mask  mean colour:   #${hex(r)}${hex(g)}${hex(b)}` +
    (values.target ? `  target ${values.target}` : ""),
);
console.log(`leftover magenta pixels inside mask: ${magenta}`);

const bandFile =
  values.band ?? path.join(path.dirname(result), "band.png");
await sharp(result)
  .resize(width, height)
  .extract({
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  })
  .png()
  .toFile(bandFile);
console.log(`wrote ${bandFile} (mask bounding-box crop)`);
