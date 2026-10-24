import type { UserRecord } from "./db";

/** Escape text for an HTML attribute. */
const attr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The first line of the bio, shortened to something a preview card can hold. */
function summary(user: UserRecord): string {
  const bio = user.profile.bio.split("\n").map(l => l.trim()).filter(Boolean)[0] ?? "";
  const text = bio || `A page on dusk.`;
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/**
 * The tags a crawler reads when someone shares a page. They are put into the HTML the
 * server sends, so a link posted somewhere shows the name and a picture without any
 * JavaScript running.
 */
export function metaTags(user: UserRecord, origin: string): string {
  const name = user.profile.name || user.username;
  const title = `${name} · dusk`;
  const description = summary(user);
  const url = `${origin}/${encodeURIComponent(user.username)}`;
  const image = `${origin}/api/public/${encodeURIComponent(user.username)}/card.png`;
  return [
    `<title>${attr(title)}</title>`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="dusk">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    `<meta property="og:url" content="${attr(url)}">`,
    `<meta property="og:image" content="${attr(image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${attr(title)}">`,
    `<meta name="twitter:description" content="${attr(description)}">`,
    `<meta name="twitter:image" content="${attr(image)}">`,
    `<meta name="description" content="${attr(description)}">`,
  ].join("\n    ");
}

/** Put the tags into the page's HTML, replacing the empty ones the app ships with. */
export function injectMeta(html: string, user: UserRecord, origin: string): string {
  const tags = metaTags(user, origin);
  return html.replace(/<title>[\s\S]*?<\/title>/, tags);
}
