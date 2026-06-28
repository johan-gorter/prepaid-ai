// Copies the prompt templates (src/prompts/*.md) into the compiled output
// (lib/prompts/*.md) so they sit next to the compiled prompts.js module at
// runtime. tsc only emits .ts files, so without this the templates would be
// missing from the emulator and the deployed function. Run after `tsc`.

import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src", "prompts");
const dest = join(root, "lib", "prompts");

if (existsSync(src)) {
  cpSync(src, dest, { recursive: true });
  console.log(`Copied prompt templates: ${src} -> ${dest}`);
}
