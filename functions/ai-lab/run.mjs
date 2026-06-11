#!/usr/bin/env node
// Local AI experiment runner — see functions/ai-lab/README.md.
//
//   node functions/ai-lab/run.mjs <approach> [options]

import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const LAB_DIR = path.dirname(fileURLToPath(import.meta.url));
const APPROACHES = ["current", "two-step", "custom"];

const USAGE = `Usage: node functions/ai-lab/run.mjs <approach> [options]

Approaches:
  current    Replicate the production paint pipeline: dotted-grayscale
             composite + colour swatch, one generation.
  two-step   Step 1 fills the marked area with the flat target colour;
             step 2 harmonises lighting/texture against the original photo.
  custom     Send an arbitrary prompt + images as-is.

Options:
  --source <file>     Clean source photo (current, two-step)
  --mask <file>       Mask image: white = repaint area, black = keep
  --composite <file>  Pre-built composite (current; skips --source/--mask,
                      e.g. one downloaded from the Storage emulator)
  --color <hex>       Target paint colour (default "#213529", RAL 6009)
  --prompt <text>     Override the approach's default prompt (current),
                      or the prompt to send (custom)
  --image <file>      Image to send, repeatable, in order (custom)
  --model <id>        Gemini model override (default gemini-2.5-flash-image)
  --spacing <px>      Dot grid spacing (default 15)
  --radius <px>       Dot radius (default 2.5)

Examples:
  node functions/ai-lab/run.mjs current --source room.jpg --mask ceiling-mask.png --color "#213529"
  node functions/ai-lab/run.mjs current --composite composite.webp --color "#213529"
  node functions/ai-lab/run.mjs two-step --source room.jpg --mask ceiling-mask.png --color "#213529"
  node functions/ai-lab/run.mjs custom --prompt "Describe this image" --image room.jpg

Outputs (inputs, prompts, intermediate and final images) are written to
functions/ai-lab/out/<approach>-<timestamp>/ (git-ignored).

GEMINI_API_KEY is read from the environment, functions/.secret.local,
functions/.env or .env.`;

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
    spacing: { type: "string" },
    radius: { type: "string" },
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
