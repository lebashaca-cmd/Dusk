import type { RenderModel } from "../../shared/types";
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

/**
 * The profile card. The slot in the middle (.pslot) is left empty here: the Discord card and the
 * music cards are filled in separately because they change while the page is open.
 */
export function cardHTML(m: RenderModel): string {
  const p = m.profile;
  const lines = bioLines(p.bio);
  const cycles = p.typewriter && lines.length > 1;
  const bio = cycles ? esc(lines[0]) : lines.map(esc).join("<br>");


  const tags = m.roles
    .map(t => `<span class="tag" style="--tc:${safeColor(t.color)};--tt:${textOn(t.color)}"><i></i>${esc(t.name)}</span>`)
    .join("");

  const links = p.links
    .filter(l => l.label.trim() || l.url.trim())
    .map((l, n) => {
      const href = safeUrl(l.url);
      const label = l.label.trim() || href;
      const name = l.icon === "auto" ? (brandForUrl(l.url) ?? "link") : l.icon;
      // In brand-color mode a logo keeps its own color unless that color would vanish into the background.
      const brand = (BRANDS as Record<string, { hex: string } | undefined>)[name];
      const tint = p.iconColor === "brand" && brand && contrast(brand.hex, p.colors.bg) >= 2.4 ? ` style="--brand:${brand.hex}"` : "";
      return `<li style="--i:${n}"><a class="plink" href="${esc(href || "#")}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}"${tint}>
        ${icon(name)}<span class="t"><b>${esc(label)}</b>${l.note ? `<small>${esc(l.note)}</small>` : ""}</span><span class="arr">${icon("arrow")}</span></a></li>`;
    })
    .join("");

  const location = p.showLocation && p.location.trim() ? `<div class="meta"><span>${icon("pin")}${esc(p.location)}</span></div>` : "";

  const avatar = `<div class="avwrap"><div class="av${p.avatar.ring ? " ring" : ""}">${avatarInner(m)}</div><span class="pres" hidden></span></div>`;
  const nameBlock = `<div class="nameblock"><h2 class="pname${p.nameGlow ? " glow" : ""}${p.nameGradient ? " grad" : ""}">${esc(p.name || m.username)}</h2><span class="phandle">@${esc(m.username)}</span></div>`;
  const bioBlock = lines.length ? `<p class="pbio${cycles ? " type" : ""}"><span class="bio-text">${bio}</span></p>` : "";
  // Centered: the usual stack. Left: the bio sits beside the picture, under the name.
  const beside = p.card.align === "left";
  const head = beside
    ? `<div class="phead">${avatar}<div class="phead-text">${nameBlock}${bioBlock}</div></div>${tags ? `<div class="tags">${tags}</div>` : ""}${location}`
    : `${avatar}${nameBlock}${tags ? `<div class="tags">${tags}</div>` : ""}${location}${bioBlock}`;

  return `<article class="pcard">
    ${p.page.share ? `<button class="share" type="button" data-share aria-label="Copy profile link">${icon("share")}</button>` : ""}
    ${head}
    <div class="pslot"></div>
    ${links ? `<ul class="plinks">${links}</ul>` : ""}
    ${p.page.views ? `<div class="views">${icon("eye")}<span>${formatCount(m.views)}</span></div>` : ""}
  </article>`;
}
