import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { UserRecord } from "../db";

/**
 * The picture that shows when a link to a page is posted in a chat or on a feed: the same
 * "picture to post" the Share tab draws in the browser (see src/web/render/preview.ts), at
 * 1200 by 630. Link previews do not draw SVG, so it is drawn as an SVG here and turned into a
 * PNG. Inter is shipped with the site, so the text looks the same on a server with no fonts.
 */

const W = 1200;
const H = 630;
const FONTS = ["Regular", "Medium", "SemiBold", "Bold", "ExtraBold"].map(w => path.resolve("assets/fonts", `Inter-${w}.otf`));
const FONT_OPTS = { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter" } as const;

const xml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** How wide a piece of text is when drawn, measured by drawing it. */
function measure(text: string, size: number, weight: number): number {
  if (!text) return 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="200"><text x="0" y="120" font-family="Inter" font-size="${size}" font-weight="${weight}">${xml(text)}</text></svg>`;
  const box = new Resvg(svg, { font: FONT_OPTS }).getBBox();
  return box ? box.width : text.length * size * 0.6;
}

/** Text cut short with an ellipsis when it would not fit. */
function fit(text: string, size: number, weight: number, max: number): string {
  if (measure(text, size, weight) <= max) return text;
  let t = text;
  while (t.length > 1 && measure(`${t}…`, size, weight) > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** #rrggbb as an SVG colour plus an opacity. */
const hexOf = (hex: string): string => (/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#ffffff");

function svgOf(user: UserRecord): string {
  const p = user.profile;
  const c = p.colors;
  const accent = hexOf(c.accent);
  const left = 84;
  let y = 176;
  const parts: string[] = [];

  const name = fit(p.name || user.username, 78, 800, W - left - 260);
  parts.push(`<text x="${left}" y="${y}" font-family="Inter" font-weight="800" font-size="78" fill="${hexOf(c.text)}">${xml(name)}</text>`);
  y += 44;
  parts.push(`<text x="${left}" y="${y}" font-family="Inter" font-weight="500" font-size="28" fill="${hexOf(c.dim)}">@${xml(user.username)}</text>`);
  y += 62;

  const bio = p.bio.split("\n").map(l => l.trim()).filter(Boolean)[0] ?? "";
  if (bio) {
    parts.push(`<text x="${left}" y="${y}" font-family="Inter" font-weight="400" font-size="32" fill="${hexOf(c.text)}" fill-opacity="0.82">${xml(fit(bio, 32, 400, W - left * 2))}</text>`);
  }

  // Up to three links, as pills.
  const links = p.links.filter(l => l.label.trim() || l.url.trim()).slice(0, 3);
  let x = left;
  const pillY = H - 168;
  for (const l of links) {
    const text = l.label.trim() || l.url;
    const w = Math.min(430, measure(text, 24, 600) + 56);
    if (x + w > W - left) break;
    parts.push(`<rect x="${x}" y="${pillY}" width="${w}" height="56" rx="28" fill="${hexOf(c.text)}" fill-opacity="0.07" stroke="${hexOf(c.text)}" stroke-opacity="0.2" stroke-width="1.5"/>`);
    parts.push(`<text x="${x + 20}" y="${pillY + 36}" font-family="Inter" font-weight="600" font-size="24" fill="${hexOf(c.text)}">${xml(fit(text, 24, 600, w - 40))}</text>`);
    x += w + 14;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W * 0.4}" y2="${H}"><stop offset="0" stop-color="${hexOf(c.bg)}"/><stop offset="1" stop-color="${hexOf(c.bg2)}"/></linearGradient>
    <radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="${W * 0.78}" cy="${H * 0.22}" r="${W * 0.55}"><stop offset="0" stop-color="${accent}" stop-opacity="0.4"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g transform="translate(${W - 190} 120)">
    <circle r="44" fill="none" stroke="${accent}" stroke-opacity="0.9" stroke-width="4"/>
    <circle r="40" fill="${accent}" fill-opacity="0.22"/>
    <line x1="-110" y1="46" x2="110" y2="46" stroke="${accent}" stroke-opacity="0.9" stroke-width="4"/>
  </g>
  ${parts.join("\n  ")}
  <text x="${left}" y="${H - 56}" font-family="Inter" font-weight="700" font-size="24" fill="${hexOf(c.dim)}">dusk</text>
  <text x="${left + 60}" y="${H - 56}" font-family="Inter" font-weight="400" font-size="20" fill="${hexOf(c.dim)}" fill-opacity="0.7">a page for everything you</text>
</svg>`;
}

const cache = new Map<string, Buffer>();

/** The card as a PNG. It is remembered until the page changes, so a busy link does not redraw it each time. */
export function renderCard(user: UserRecord): Buffer {
  const svg = svgOf(user);
  const hit = cache.get(svg);
  if (hit) return hit;
  const png = new Resvg(svg, { font: FONT_OPTS }).render().asPng();
  if (cache.size >= 200) cache.delete(cache.keys().next().value as string);
  cache.set(svg, png);
  return png;
}
