/**
 * Shared types for the impression wizard.
 *
 * `NewImpressionPage.vue` drives a six-stage state machine; the individual
 * step components and the generate / draft / share composables all key off
 * these two unions, so they live here rather than being re-declared per file.
 */

/** The wizard's stages, in roughly the order a fresh photo travels. */
export type Stage =
  | "preview"
  | "mask"
  | "choose-action"
  | "paint"
  | "material"
  | "prompt"
  | "processing";

/** Where the wizard's source image came from. Drives routing + persistence. */
export type Source = "photo" | "crop" | "original" | "impression" | "share";
