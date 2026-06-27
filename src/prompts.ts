// Client-side AI prompts, kept in one place so they can be swapped or
// A/B-tested without digging through the wizard views. The server-side edit
// prompts live in functions/src/prompts.ts.

// Hard-coded prompt for the "Verwijderen" (remove) action. Paired with a
// solid magenta composite so Gemini sees a clean "stain" and inpaints the
// area instead of trying to interpret a free-form user prompt.
export const REMOVE_PROMPT =
  "remove the magenta stains. There a clear clean empty piece of the photo there.";
