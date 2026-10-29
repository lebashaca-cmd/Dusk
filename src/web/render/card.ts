import type { BoardBox, LinkItem, Profile, RenderModel } from "../../shared/types";
import { BRANDS, brandForUrl } from "../../shared/brands";
import { safeUrl } from "../../shared/url";
import { icon } from "../ui/icons";
import { esc } from "../util/dom";
import { contrast, formatCount, safeColor, textOn } from "../util/format";

export const bioLines = (bio: string): string[] => bio.split("\n").map(l => l.trim()).filter(Boolean);

function avatarInner(m: RenderModel): string {
  const a = m.profile.avatar;
  if (a.kind === "image" && m.avatarUrl) return `<img src="${esc(m.avatarUrl)}" alt="">`;
  if (a.kind === "discord" && m.discordAvatarUrl) return `<img src="${esc(m.discordAvatarUrl)}" alt="" referrerpolicy="no-referrer">`;
  if (a.kind === "emoji" && a.emoji.trim()) return `<span class="av-emoji">${esc(a.emoji.trim())}</span>`;
  const letter = ((m.profile.name || m.username).trim().charAt(0) || "?").toUpperCase();
  return `<span class="av-letter">${esc(letter)}</span>`;
}

/** One link, as a row. */
function linkHTML(l: LinkItem, p: Profile, n: number): string {
  const href = safeUrl(l.url);
  const label = l.label.trim() || href;
  const name = l.icon === "auto" ? (brandForUrl(l.url) ?? "link") : l.icon;
  // In brand-color mode a logo keeps its own color unless that color would vanish into the background.
  const brand = (BRANDS as Record<string, { hex: string } | undefined>)[name];
  const tint = p.iconColor === "brand" && brand && contrast(brand.hex, p.colors.bg) >= 2.4 ? ` style="--brand:${brand.hex}"` : "";
  return `<li style="--i:${n}"><a class="plink" href="${esc(href || "#")}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}"${tint} data-link-id="${esc(l.id)}">
    ${icon(name)}<span class="t"><b>${esc(label)}</b>${l.note ? `<small>${esc(l.note)}</small>` : ""}</span><span class="arr">${icon("arrow")}</span></a></li>`;
}

/**
 * The links, split into the groups the person made. Links with no group come first,
 * then each group in the order they set it.
 */
export function linksHTML(p: Profile): string {
  const shown = p.links.filter(l => l.label.trim() || l.url.trim());
  if (!shown.length) return "";
  const groups = p.groups.filter(g => g.label.trim());
  const loose = shown.filter(l => !l.group || !groups.some(g => g.id === l.group));
  let n = 0;
  const block = (items: LinkItem[]): string => `<ul class="plinks">${items.map(l => linkHTML(l, p, n++)).join("")}</ul>`;
  const out: string[] = [];
  if (loose.length) out.push(block(loose));
  for (const g of groups) {
    const items = shown.filter(l => l.group === g.id);
    if (!items.length) continue;
    out.push(`<div class="plinkgroup"><h4 class="pgtitle">${esc(g.label)}</h4>${block(items)}</div>`);
  }
  return `<div class="plinks-wrap">${out.join("")}</div>`;
}

/**
 * The top of the card: the picture, the name, the tags, the place and the bio.
 * The free-form page puts this in a box of its own.
 */
export function headHTML(m: RenderModel, box?: BoardBox): string {
  const p = m.profile;
  const lines = bioLines(p.bio);
  const cycles = p.typewriter && lines.length > 1;
  const bio = cycles ? esc(lines[0]) : lines.map(esc).join("<br>");

  const tags = m.roles
    .map(t => `<span class="tag" style="--tc:${safeColor(t.color)};--tt:${textOn(t.color)}"><i></i>${esc(t.name)}</span>`)
    .join("");

  const location = p.showLocation && p.location.trim() ? `<div class="meta"><span>${icon("pin")}${esc(p.location)}</span></div>` : "";

  const avatar = box?.noav ? "" : `<div class="avwrap"><div class="av${p.avatar.ring ? " ring" : ""}">${avatarInner(m)}</div><span class="pres" hidden></span></div>`;
  // A piece on the board can have a name look of its own; otherwise the page's look is used.
  const glow = box?.nfx ? box.nfx === "glow" : p.nameGlow;
  const grad = box?.nfx ? box.nfx === "gradient" : p.nameGradient;
  const cased = box?.ncase === "upper" ? " uc" : box?.ncase === "lower" ? " lc" : box?.ncase === "normal" ? " nc" : "";
  const shown = box?.ntext?.trim() || p.name || m.username;
  const handle = box?.handle === "none" ? "" : box?.handle === "discord" ? (m.discordTag ? `@${m.discordTag}` : "") : `@${m.username}`;
  const serverTagHTML = (t: NonNullable<RenderModel["serverTag"]>): string => `<span class="stag">${t.badgeUrl ? `<img src="${esc(t.badgeUrl)}" alt="" referrerpolicy="no-referrer">` : ""}<b>${esc(t.tag)}</b></span>`;
  const nameBlock = `<div class="nameblock">${box?.stag && m.serverTag ? `<div class="nameline">` : ""}<h2 class="pname${glow ? " glow" : ""}${grad ? " grad" : ""}${cased}">${esc(shown)}</h2>${box?.stag && m.serverTag ? `${serverTagHTML(m.serverTag)}</div>` : ""}${handle ? `<span class="phandle">${esc(handle)}</span>` : ""}</div>`;
  const bioBlock = lines.length ? `<p class="pbio${cycles ? " type" : ""}"><span class="bio-text">${bio}</span></p>` : "";
  // Centered: the usual stack. Left: the bio sits beside the picture, under the name.
  const beside = p.card.align === "left";
  return beside
    ? `<div class="phead">${avatar}<div class="phead-text">${nameBlock}${bioBlock}</div></div>${tags ? `<div class="tags">${tags}</div>` : ""}${location}`
    : `${avatar}${nameBlock}${tags ? `<div class="tags">${tags}</div>` : ""}${location}${bioBlock}`;
}

/** The view counter. */
export function viewsHTML(m: RenderModel): string {
  return m.profile.page.views ? `<div class="views">${icon("eye")}<span>${formatCount(m.views)}</span></div>` : "";
}

/** The button that copies the address of the page. */
export function shareHTML(m: RenderModel): string {
  return m.profile.page.share ? `<button class="share" type="button" data-share aria-label="Copy profile link">${icon("share")}</button>` : "";
}

/**
 * The profile card. The slot in the middle (.pslot) is left empty here: the Discord card and the
 * music cards are filled in separately because they change while the page is open.
 */
export function cardHTML(m: RenderModel): string {
  const p = m.profile;
  return `<article class="pcard">
    ${shareHTML(m)}
    ${headHTML(m)}
    <div class="pslot"></div>
    ${linksHTML(p)}
    ${viewsHTML(m)}
  </article>`;
}
