import { ownerOf, type UserRecord } from "./db";
import { customAvatarUrl } from "./mappers";
import { discordAvatarUrl } from "./services/discord";
import { embedRev } from "./services/card";
import { isVip } from "./pages";
import { safeUrl } from "../shared/url";

/** Escape text for an HTML attribute. */
const attr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The first line of the bio, shortened to something a preview card can hold. */
function summary(user: UserRecord): string {
  const bio = user.profile.bio.split("\n").map(l => l.trim()).filter(Boolean)[0] ?? "";
  const text = bio || `A page on dusk.`;
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/** Fill {name}, {username}, {views} and {links} in a line the owner wrote for the preview. */
export function fillTokens(text: string, user: UserRecord): string {
  const vars: Record<string, string> = {
    name: user.profile.name || user.username,
    username: user.username,
    views: String(user.views),
    links: String(user.profile.links.length),
  };
  return text.replace(/\{(name|username|views|links)\}/g, (_m, k: string) => vars[k] ?? "");
}

/** A web address that a preview can use: a full address, or a path on this site made into one. */
function absolute(url: string | null | undefined, origin: string): string | null {
  if (!url) return null;
  if (url.startsWith("/")) return `${origin}${url}`;
  return /^https:\/\//i.test(url) ? url : null;
}

/** What the preview shows for the picture the owner picked. A picture that is not there falls back to the generated card. */
function pictureOf(user: UserRecord, origin: string): { url: string; card: boolean } | null {
  // The version in the address changes with every update and every change to the picture, so apps fetch it again.
  const card = { url: `${origin}/api/public/${encodeURIComponent(user.username)}/card.png?v=${embedRev(user)}`, card: true };
  switch (user.profile.embed.image) {
    case "none": return null;
    case "avatar": {
      const url = absolute(customAvatarUrl(user) ?? discordAvatarUrl(ownerOf(user), user.discordAvatar), origin);
      return url ? { url, card: false } : card;
    }
    case "background": {
      // A picture background is a VIP thing, so it is only used for a VIP page.
      const raw = isVip(user) && user.profile.bgImage ? safeUrl(user.profile.bgImage) : "";
      const url = raw && !/\.(mp4|webm|ogg)(\?|$)/i.test(raw) ? absolute(raw, origin) : null;
      return url ? { url, card: false } : card;
    }
    default: return card;
  }
}

/**
 * The tags a crawler reads when someone shares a page. They are put into the HTML the
 * server sends, so a link posted somewhere shows the name and a picture without any
 * JavaScript running. The owner shapes them in the Embed section.
 */
export function metaTags(user: UserRecord, origin: string): string {
  const e = user.profile.embed;
  const name = user.profile.name || user.username;
  const title = fillTokens(e.title.trim(), user).trim() || `${name} · dusk`;
  const description = fillTokens(e.desc.trim(), user).trim() || summary(user);
  const site = fillTokens(e.site.trim(), user).trim() || "dusk";
  const color = e.color || user.profile.colors.accent;
  const url = `${origin}/${encodeURIComponent(user.username)}`;
  const pic = pictureOf(user, origin);
  const lines = [
    `<title>${attr(title)}</title>`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="${attr(site)}">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    `<meta property="og:url" content="${attr(url)}">`,
    `<meta name="theme-color" content="${attr(color)}">`,
  ];
  if (pic) {
    lines.push(`<meta property="og:image" content="${attr(pic.url)}">`);
    if (pic.card) lines.push(`<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`);
  }
  lines.push(
    `<meta name="twitter:card" content="${pic && e.large ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${attr(title)}">`,
    `<meta name="twitter:description" content="${attr(description)}">`,
  );
  if (pic) lines.push(`<meta name="twitter:image" content="${attr(pic.url)}">`);
  lines.push(`<meta name="description" content="${attr(description)}">`);
  return lines.join("\n    ");
}

/** Put the tags into the page's HTML, replacing the empty ones the app ships with. */
export function injectMeta(html: string, user: UserRecord, origin: string): string {
  const tags = metaTags(user, origin);
  // The page ships its own theme colour. The owner's takes its place.
  return html.replace(/<meta name="theme-color"[^>]*>\s*/i, "").replace(/<title>[\s\S]*?<\/title>/, tags);
}
