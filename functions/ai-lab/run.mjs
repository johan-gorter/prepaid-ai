#!/usr/bin/env node
// Local AI experiment runner — see functions/ai-lab/README.md.
//
//   node functions/ai-lab/run.mjs <approach> [options]

import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const LAB_DIR = path.dirname(fileURLToPath(import.meta.url));
const APPROACHES = [
  "paint",
  "current",
  "reference",
  "two-step",
  "paint-everything",
  "custom",
];

const USAGE = `Usage: node functions/ai-lab/run.mjs <approach> [options]

Approaches:
  paint      One-shot masked repaint on nano banana 2 (the 2026-06-12
             experiment winner): magenta checker composite (50% coverage)
             + tinted reference room, with a tweakable marking variant
             (--variant/--cell/--coverage/--spacing/--radius) and colour
             lightening (--lighten).
  current    Replicate the old production paint pipeline: dotted-grayscale
             composite + whole-image colour/material reference (paint
             multiplied over the clean source), one generation.
  reference  Like current, but the colour reference comes from the bundled
             reference room (functions/reference/room.png or functions/reference/room-dark.png)
             tinted with the paint colour, sent as two references (bright +
             dim lighting).
  two-step   Step 1 fills the marked area with the flat target colour;
             step 2 harmonises lighting/texture against the original photo.
  paint-everything
             No mask: clean source + flat swatch, model paints every surface
             in the scene with the one colour (step 1 of the global-paint
             then cut-out idea).
  custom     Send an arbitrary prompt + images as-is.

Options:
  --source <file>     Clean source photo (current, two-step). Required for
                      current — the colour reference is built from it.
  --mask <file>       Mask image: white = repaint area, black = keep
  --composite <file>  Pre-built composite (current; skips --mask, still
                      needs --source, e.g. one downloaded from the Storage
                      emulator)
  --color <hex>       Target paint colour (default "#213529", RAL 6009)
  --prompt <text>     Override the approach's default prompt (current),
                      or the prompt to send (custom)
  --image <file>      Image to send, repeatable, in order (custom)
  --model <id>        Gemini model override (default gemini-2.5-flash-image;
                      the paint approach defaults to gemini-3-pro-image-preview)
  --variant <name>    Marking variant for paint: checker | dots | grayscale |
                      solid (default checker)
  --cell <px>         Checker cell size (default 10)
  --coverage <name>   Checker coverage: half (50%) | quarter (25%)
                      (default half)
  --spacing <px>      Dot grid spacing (default 15)
  --radius <px>       Dot radius (default 2.5)
  --lighten <0..1>    Lighten the colour sent to the model (prompt +
                      reference) toward white (paint; default 0)

Examples:
  node functions/ai-lab/run.mjs paint --source room.jpg --mask ceiling-mask.png --color "#887360" --lighten 0.2
  node functions/ai-lab/run.mjs current --source room.jpg --mask ceiling-mask.png --color "#213529"
  node functions/ai-lab/run.mjs current --source room.jpg --composite composite.webp --color "#213529"
  node functions/ai-lab/run.mjs reference --source room.jpg --mask ceiling-mask.png --color "#213529"
  node functions/ai-lab/run.mjs two-step --source room.jpg --mask ceiling-mask.png --color "#213529"
  node functions/ai-lab/run.mjs custom --prompt "Describe this image" --image room.jpg

Outputs (inputs, prompts, intermediate and final images) are written to
functions/ai-lab/out/<approach>-<timestamp>/ (git-ignored).

Uses Vertex AI via Application Default Credentials. Run
\`gcloud auth application-default login\` once and set GOOGLE_CLOUD_PROJECT
(or rely on the default project in .firebaserc). AI_REGION overrides the
location (default: global).`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: "string" },
    mask: { type: "string" },
    composite: { type: "string" },
    color: { type: "string", default: "#213529" },
    prompt: { type: "string" },
    image: { type: "string", multiple: true },
    model: { type: "string" },
    variant: { type: "string" },
    cell: { type: "string" },
    coverage: { type: "string" },
    spacing: { type: "string" },
    radius: { type: "string" },
    lighten: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

const approach = positionals[0];
if (values.help || !approach || !APPROACHES.includes(approach)) {
  console.error(USAGE);
  process.exit(values.help ? 0 : 1);
}

const mod = await import(
  pathToFileURL(path.join(LAB_DIR, "approaches", `${approach}.mjs`))
);
try {
  await mod.default(values);
} catch (err) {
  console.error(`\nFailed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
