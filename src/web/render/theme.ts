import { FONTS } from "../../shared/constants";
import type { RenderModel } from "../../shared/types";
import { isVideoUrl } from "../../shared/url";

/**
 * Pass a person's design choices to the stylesheet. Colors, sizes and font go in as CSS variables;
 * choices that change which rules apply go in as data attributes (see profile.css).
 */
export function applyTheme(host: HTMLElement, m: RenderModel, width?: number): void {
  const p = m.profile;
  const style = host.style;
  style.setProperty("--p-bg", p.colors.bg);
  style.setProperty("--p-bg2", p.colors.bg2);
  style.setProperty("--p-text", p.colors.text);
  style.setProperty("--p-dim", p.colors.dim);
  style.setProperty("--p-accent", p.colors.accent);
  style.setProperty("--p-radius", `${p.card.radius}px`);
  style.setProperty("--p-blur", `${p.card.blur}px`);
  style.setProperty("--p-width", `${width ?? p.card.width}px`);
  style.setProperty("--p-angle", `${p.gradAngle}deg`);
  style.setProperty("--p-font", FONTS[p.font].css);
  style.setProperty("--name-size", `${p.nameSize}px`);
  style.setProperty("--name-weight", String(p.nameWeight));
  style.setProperty("--av", `${p.avatar.size}px`);
  style.setProperty("--ringw", `${p.avatar.ringWidth}px`);
  style.setProperty("--p-shadow", String(p.card.shadow));
  style.setProperty("--p-dim-o", String(p.bgDim / 100));
  style.setProperty("--p-bgblur", `${p.bgBlur}px`);
  style.setProperty("--p-speed", String(p.bgSpeed));
  style.setProperty("--p-gap", `${p.linkGap}px`);
  style.setProperty("--p-track", String(p.nameTracking));
  style.setProperty("--p-bio", String(p.bioScale / 100));
  // The address was checked on the server (http or https only). Escape what could break out of url("...").
  style.setProperty("--p-bgimg", p.bgImage && !isVideoUrl(p.bgImage) ? `url("${p.bgImage.replace(/["\\\n\r()]/g, ch => encodeURIComponent(ch))}")` : "none");

  const d = host.dataset;
  d.bg = p.bgType;
  d.card = p.card.style;
  d.align = p.card.align;
  d.shape = p.avatar.shape;
  d.tag = p.tagStyle;
  d.links = p.linkLayout;
  d.icons = p.iconColor;
  d.hover = p.linkHover;
  d.border = p.card.border ? "on" : "off";
  d.bcolor = p.card.borderColor;
  d.case = p.nameCase;
  d.glow = p.effects.cursorGlow ? "on" : "off";
}
