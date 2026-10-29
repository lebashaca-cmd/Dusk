import { embedSvg, type EmbedCtx } from "../../shared/embedcard";
import type { EmbedDesign, RenderModel } from "../../shared/types";
import { esc } from "../util/dom";

/** What the enter screen's drawing is filled with: this page's own name, words, links and pictures. */
export function gateCtx(m: RenderModel): EmbedCtx {
  const p = m.profile;
  return {
    colors: p.colors,
    name: p.name || m.username,
    username: m.username,
    bio: p.bio.split("\n").map(l => l.trim()).find(Boolean) ?? "",
    views: m.views,
    links: p.links.map(l => l.label.trim() || l.url.trim()).filter(Boolean).slice(0, 8),
    tag: m.serverTag?.tag ?? "",
    href: (src, url) => (src === "avatar" ? m.avatarUrl ?? null : src === "background" ? (p.bgImage && !/\.(mp4|webm|ogg)(\?|$)/i.test(p.bgImage) ? p.bgImage : null) : url || null),
  };
}

/** The inside of an arranged enter screen: the video (if any) behind, and the drawing on top. */
export function gateHTML(m: RenderModel, d: EmbedDesign): string {
  const video = d.bg.video ? `<video class="gate-video" src="${esc(d.bg.video)}" autoplay muted loop playsinline aria-hidden="true"></video>` : "";
  const svg = embedSvg(d, gateCtx(m), "gt", Boolean(d.bg.video))
    .replace("<svg ", `<svg class="gate-art" preserveAspectRatio="xMidYMid meet" `);
  return `${video}${svg}`;
}

/** The colour that fills the screen around the drawing, so its edges melt into the background. */
export function gateFill(m: RenderModel, d: EmbedDesign): string {
  return d.bg.mode === "solid" || d.bg.mode === "gradient" ? d.bg.c1 : m.profile.colors.bg;
}
