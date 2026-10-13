export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Milliseconds as m:ss. */
export function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function safeColor(c: string): string {
  return /^#[0-9a-f]{6}$/i.test(c) ? c : "#ffffff";
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = safeColor(hex).slice(1);
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever reads better on this background color. */
export const textOn = (hex: string): string => (luminance(hex) > 0.55 ? "#000000" : "#ffffff");

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** WCAG relative luminance (with gamma correction), 0 to 1. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors, 1 (identical) to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
