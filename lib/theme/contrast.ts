/** WCAG 2.x contrast helpers. */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** AA thresholds: 4.5 normal text, 3 for large text (24px, or 18.66px bold) and UI graphics. */
export type Requirement = "text" | "large" | "ui";
export const AA_MIN: Record<Requirement, number> = { text: 4.5, large: 3, ui: 3 };

export function passesAA(fg: string, bg: string, req: Requirement): boolean {
  return contrastRatio(fg, bg) >= AA_MIN[req];
}
