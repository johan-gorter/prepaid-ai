/**
 * Curated paint swatches offered on the paint step's "Standaard" tab.
 *
 * Five themed groups of four swatches each. Group titles are i18n keys
 * (resolved in the component); swatch labels are data — RAL codes or short
 * colour names — shown inside each button. This module is the single source of
 * swatch data so the curated list can be tuned without touching the UI.
 */
export interface PaintSwatch {
  /** Short label shown inside the swatch (RAL code or colour name). */
  label: string;
  hex: string;
}

export interface PaintPresetGroup {
  /** i18n key for the group title (e.g. "newImpression.paintGroupTaupe"). */
  titleKey: string;
  swatches: PaintSwatch[];
}

export const PAINT_PRESET_GROUPS: PaintPresetGroup[] = [
  {
    titleKey: "newImpression.paintGroupRalLight",
    swatches: [
      { label: "9016", hex: "#F1F0EA" },
      { label: "9010", hex: "#F1ECE1" },
      { label: "9001", hex: "#E9E0D2" },
      { label: "9002", hex: "#D7D5CB" },
    ],
  },
  {
    titleKey: "newImpression.paintGroupRalDark",
    swatches: [
      { label: "7016", hex: "#373F43" },
      { label: "7021", hex: "#2E3234" },
      { label: "9005", hex: "#0A0A0D" },
      { label: "6009", hex: "#27352A" },
    ],
  },
  {
    titleKey: "newImpression.paintGroupTaupe",
    swatches: [
      { label: "Greige", hex: "#A89F91" },
      { label: "Klei", hex: "#B8A99A" },
      { label: "Linnen", hex: "#C9BFB1" },
      { label: "Mokka", hex: "#8A7A6B" },
    ],
  },
  {
    titleKey: "newImpression.paintGroupPink",
    swatches: [
      { label: "Oudroze", hex: "#C49EA0" },
      { label: "Poederroze", hex: "#E8C7C8" },
      { label: "Zalm", hex: "#E8A593" },
      { label: "Blush", hex: "#F2D6D3" },
    ],
  },
  {
    titleKey: "newImpression.paintGroupBrown",
    swatches: [
      { label: "Cognac", hex: "#9A6A4F" },
      { label: "Karamel", hex: "#B07B4F" },
      { label: "Umber", hex: "#6E5849" },
      { label: "Chocolade", hex: "#5C4033" },
    ],
  },
];

export const DEFAULT_PAINT_COLOR =
  PAINT_PRESET_GROUPS[0]!.swatches[0]!.hex;
