// ---------------------------------------------------------------------------
// AI edit prompts, kept in one place so they can be swapped or A/B-tested
// without touching the request-building logic in ai.ts. Read
// docs/nano-banana-prompting.md before changing any wording — it records what
// has been proven to work and what backfired.
// ---------------------------------------------------------------------------

/**
 * Paint / recolour prompt (nano banana 2, 50% magenta checkerboard).
 *
 * `sentColor` is the already-lightened hex actually sent to the model.
 *
 * "spans entirely" + "never half-painting a surface" make the model treat the
 * checkerboard as a per-surface signal: a surface that is only partly under
 * the pattern (sloppy masking) is left untouched instead of being half
 * painted. Only surfaces the checkerboard covers from edge to edge get painted.
 */
export function buildPaintPrompt(sentColor: string): string {
  return (
    `The first image is a photo in which the area to repaint is covered ` +
    `by a magenta checkerboard; the original surfaces are partly visible ` +
    `between the squares. Paint only the surfaces the checkerboard spans ` +
    `entirely - whatever their material or original colour - in the paint ` +
    `colour ${sentColor}; leave any surface it spans only partly unchanged, ` +
    `never half-painting a surface. Reconstruct the covered geometry exactly ` +
    `as it appears: every structural element stays in place, painted in this ` +
    `one colour, varied only by lighting. Objects in front of the painted ` +
    `surfaces are not painted: reconstruct them crisp with their original ` +
    `colours. No magenta remains, and everything outside the marked area ` +
    `stays unchanged.`
  );
}

/**
 * Free-prompt / remove wrapper. The user's instruction is appended after a
 * short framing that points the model at the magenta-marked region.
 */
export function buildEditPrompt(userPrompt: string): string {
  return (
    `Apply the prompt below to the magenta checkered area. ` +
    `Do not include the checkered area in the output.\n\n${userPrompt}`
  );
}
