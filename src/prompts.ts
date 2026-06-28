// Client-side AI prompts. The wording lives in the .md templates under
// `prompts/` so it can be swapped or A/B-tested without digging through the
// wizard views; Vite inlines the file contents via the `?raw` import. The
// server-side edit prompts live in functions/src/prompts.ts.

// Hard-coded prompt for the "Verwijderen" (remove) action. Paired with a
// solid magenta composite so Gemini sees a clean "stain" and inpaints the
// area instead of trying to interpret a free-form user prompt.
import removeTemplate from "./prompts/remove.md?raw";

export const REMOVE_PROMPT = removeTemplate.trim();
