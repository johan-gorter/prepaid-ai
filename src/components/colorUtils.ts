/**
 * Dependency-free colour helpers for the paint step.
 *
 * Used by both the standard swatches (contrast-correct labels) and the custom
 * HSL picker (hex ↔ HSL round-tripping, live preview text colour). Keeping the
 * maths here — instead of pulling in a colour library — is a deliberate #87
 * decision: small, auditable, identical on every platform.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  /** Hue in degrees, 0–360. */
  h: number;
  /** Saturation in percent, 0–100. */
  s: number;
  /** Lightness in percent, 0–100. */
  l: number;
}

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

/** Returns a canonical `#RRGGBB` (uppercase) for a valid hex, else `null`. */
export function normalizeHex(hex: string): string | null {
  const match = HEX_RE.exec(hex.trim());
  return match ? `#${match[1]!.toUpperCase()}` : null;
}

export function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case rN:
        h = (gN - bN) / delta + (gN < bN ? 6 : 0);
        break;
      case gN:
        h = (bN - rN) / delta + 2;
        break;
      default:
        h = (rN - gN) / delta + 4;
        break;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = lN - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

export function hexToHsl(hex: string): Hsl | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsl(rgb) : null;
}

export function hslToHex(hsl: Hsl): string {
  return rgbToHex(hslToRgb(hsl));
}

/**
 * YIQ-based readable text colour for a coloured background. Returns black on
 * light colours and white on dark ones, computed purely from the colour itself
 * (intentionally independent of the app's dark/light theme).
 */
export function contrastText(hex: string): "#000000" | "#FFFFFF" {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#000000";
  const yiq = (299 * rgb.r + 587 * rgb.g + 114 * rgb.b) / 1000;
  return yiq >= 128 ? "#000000" : "#FFFFFF";
}
