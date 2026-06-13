/**
 * Curated paint swatches offered on the paint step.
 *
 * Currently 4 light + 4 dark standard RAL approximations, plus a free colour
 * picker on the "custom" tab. Issue #87 grows this into 5 named groups × 4
 * colours — keep this module the single source of swatch data so that change
 * stays isolated.
 */
export interface PaintPreset {
  name: string;
  hex: string;
}

export const PAINT_PRESETS: PaintPreset[] = [
  { name: "RAL 9010", hex: "#F4F4F0" },
  { name: "RAL 9001", hex: "#EAE6CA" },
  { name: "RAL 1013", hex: "#E3D9C6" },
  { name: "RAL 7035", hex: "#C5C7C4" },
  { name: "RAL 7016", hex: "#383E42" },
  { name: "RAL 9005", hex: "#0A0A0A" },
  { name: "RAL 5004", hex: "#18171C" },
  { name: "RAL 6009", hex: "#213529" },
];

export const DEFAULT_PAINT_COLOR = PAINT_PRESETS[0]!.hex;
