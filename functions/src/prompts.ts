// ---------------------------------------------------------------------------
// AI edit prompts. The wording lives in the .md templates under
// `prompts/` (named-placeholder files like `{{color}}`) so it can be swapped
// or A/B-tested without touching the request-building logic in ai.ts. Read
// docs/nano-banana-prompting.md before changing any wording — it records what
// has been proven to work and what backfired.
//
// The build step (`tsc` + copy-prompts.mjs) copies `src/prompts/*.md` to
// `lib/prompts/*.md`, so templates resolve next to the compiled module both
// in the emulator and in the deployed function.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "prompts");

const templateCache = new Map<string, string>();

/** Read a prompt template by name, caching it after first read. */
function loadTemplate(name: string): string {
  let template = templateCache.get(name);
  if (template === undefined) {
    template = readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf8").trim();
    templateCache.set(name, template);
  }
  return template;
}

/** Replace every `{{name}}` placeholder with the matching variable. */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    if (!(key in vars)) {
      throw new Error(`Missing value for prompt placeholder "{{${key}}}"`);
    }
    return vars[key];
  });
}

/**
 * Paint / recolour prompt (nano banana 2). A single image is sent: the photo
 * with the surfaces to repaint covered by a 50% magenta checkerboard.
 *
 * `sentColor` is the already-lightened hex actually sent to the model.
 *
 * "fully covered" + "never paint half a surface" make the model treat the
 * checkerboard as a per-surface signal: a surface only partly under the
 * pattern (sloppy masking) is left untouched instead of half painted.
 */
export function buildPaintPrompt(sentColor: string): string {
  return render(loadTemplate("paint"), { color: sentColor });
}

/**
 * Free-prompt / remove wrapper. The user's instruction is substituted into a
 * short framing that points the model at the magenta-marked region.
 */
export function buildEditPrompt(userPrompt: string): string {
  return render(loadTemplate("edit"), { prompt: userPrompt });
}

/**
 * Apply-material prompt (nano banana 2). Two images are sent: the photo with the
 * surfaces to resurface covered by a 50% magenta checkerboard (the first image)
 * and the user's material reference photo (the second image). The prompt refers
 * to the images by position, so the request must push them in that order.
 */
export function buildMaterialPrompt(): string {
  return render(loadTemplate("material"), {});
}
