// ---------------------------------------------------------------------------
// AI edit prompts, kept in one place so they can be swapped or A/B-tested
// without touching the request-building logic in ai.ts. Read
// docs/nano-banana-prompting.md before changing any wording — it records what
// has been proven to work and what backfired.
// ---------------------------------------------------------------------------

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
  return (
    `This photo has a magenta checkerboard covering the surfaces to ` +
    `repaint; the original surfaces show between the squares. Repaint every ` +
    `fully covered surface in the colour ${sentColor} - one flat colour, ` +
    `varied only by the lighting - whatever its material or original ` +
    `colour. Leave any surface that is only partly covered untouched; never ` +
    `paint half a surface. Reconstruct the covered geometry exactly as in ` +
    `the photo, and keep objects in front of these surfaces unpainted in ` +
    `their original colours. Remove all magenta, and change nothing outside ` +
    `the repainted surfaces.`
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
