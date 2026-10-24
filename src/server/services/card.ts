import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { UserRecord } from "../db";

/**
 * The picture that shows when a link to a page is posted in a chat or on a feed (1200×630).
 *
 * Link previews do not draw SVG, so the card is drawn as an SVG here and turned into a PNG.
 * Inter is shipped with the site, so the text looks the same on a server that has no fonts.
 */

const FONTS = ["Inter-Bold.otf", "Inter-Regular.otf"].map(f => path.resolve("assets/fonts", f));

const xml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Break a line of text into at most two lines that fit the card. */
function wrap(text: string, width: number, lines = 2): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if ((line + " " + word).trim().length > width) {
      if (line) out.push(line);
      line = word.length > width ? clip(word, width) : word;
      if (out.length === lines) break;
    } else line = (line + " " + word).trim();
  }
  if (out.length < lines && line) out.push(line);
  if (out.length === lines && text.length > out.join(" ").length + 1) out[lines - 1] = clip(out[lines - 1]!.replace(/…$/, ""), width - 1) + "…";
  return out.slice(0, lines);
}

function svgOf(user: UserRecord): string {
  const p = user.profile;
  const c = p.colors;
  const name = clip(p.name || user.username, 22);
  const bio = p.bio.split("\n").map(l => l.trim()).filter(Boolean)[0] ?? "";
  const bioLines = bio ? wrap(bio, 46) : [];
  const size = name.length > 14 ? 96 : 118;
  const lines = bioLines.map((l, i) => `<text x="96" y="${400 + i * 46}" font-family="Inter" font-size="34" fill="${xml(c.dim)}">${xml(l)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${xml(c.bg)}"/><stop offset="1" stop-color="${xml(c.bg2)}"/></linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="0.7"><stop offset="0" stop-color="${xml(c.accent)}" stop-opacity="0.32"/><stop offset="1" stop-color="${xml(c.accent)}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="40" y="40" width="1120" height="550" rx="40" fill="none" stroke="${xml(c.text)}" stroke-opacity="0.14" stroke-width="2"/>
  <text x="96" y="${bioLines.length ? 270 : 330}" font-family="Inter" font-weight="700" font-size="${size}" fill="${xml(c.text)}" letter-spacing="-3">${xml(name)}</text>
  <text x="100" y="${bioLines.length ? 336 : 396}" font-family="Inter" font-size="38" fill="${xml(c.accent)}">@${xml(clip(user.username, 30))}</text>
  ${lines}
  <text x="96" y="540" font-family="Inter" font-weight="700" font-size="34" fill="${xml(c.text)}">dusk</text>
  <text x="190" y="540" font-family="Inter" font-size="28" fill="${xml(c.dim)}">a page for everything you are</text>
</svg>`;
}

const cache = new Map<string, Buffer>();

/** The card as a PNG. It is remembered until the page changes, so a busy link does not redraw it each time. */
export function renderCard(user: UserRecord): Buffer {
  const svg = svgOf(user);
  const hit = cache.get(svg);
  if (hit) return hit;
  const png = new Resvg(svg, {
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter" },
  }).render().asPng();
  if (cache.size >= 200) cache.delete(cache.keys().next().value as string);
  cache.set(svg, png);
  return png;
}
