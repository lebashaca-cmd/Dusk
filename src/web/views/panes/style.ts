import { ALIGNS, BORDER_COLORS, CARD_STYLES, ENTRANCES, FONT_KEYS, NAME_CASES, THEME_KEYS, type BgType, type ThemeName } from "../../../shared/types";
import { FONTS, THEMES } from "../../../shared/constants";
import { store } from "../../state";
import { bindFields, bindPickers, colorField, group, pickerField, rangeField, selectField, textField, toggle, vipLock, type Pane, type PickerOption } from "./fields";

/** The backgrounds a page can have. The VIP ones are for VIP members only. */
const BACKGROUNDS: readonly PickerOption[] = [
  { value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }, { value: "aurora", label: "Aurora" },
  { value: "particles", label: "Particles" }, { value: "grid", label: "Grid" }, { value: "dots", label: "Dots" },
  { value: "lines", label: "Lines" }, { value: "spotlight", label: "Spotlight" },
  { value: "waves", label: "Waves" }, { value: "bokeh", label: "Bokeh" }, { value: "beams", label: "Beams" }, { value: "topo", label: "Contours" },
  { value: "mesh", label: "Mesh", vip: true }, { value: "stars", label: "Stars", vip: true }, { value: "rain", label: "Rain", vip: true },
  { value: "grain", label: "Grain", vip: true }, { value: "glitch", label: "Glitch", vip: true }, { value: "image", label: "Picture", vip: true },
].map(b => ({ ...b, swatch: `<i class="pv pv-sm pv-${b.value}" aria-hidden="true"></i>` }));

const MOVING: readonly BgType[] = ["aurora", "mesh", "stars", "rain", "waves", "bokeh", "beams", "glitch"];

const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1);

export const stylePane: Pane = {
  id: "style",
  label: "Style",
  hint: "Colours, backgrounds, the card and the type.",
  mount(el) {
    const vip = store.me!.vip;
    const draw = (): void => {
      const p = store.profile;
      const c = p.colors;
      // The little pictures use the page's own colours, like the ones in the Look section.
      const swatch = `--bg:${c.bg};--bg2:${c.bg2};--ac:${c.accent};--tx:${c.text}`;
      const themes = THEME_KEYS.map(k => {
        const t = THEMES[k];
        return { value: k, label: t.name, swatch: `<i class="pv pv-sm" aria-hidden="true" style="background:linear-gradient(135deg,${t.colors.bg},${t.colors.bg2})"></i>` };
      });
      el.innerHTML = [
        group("Theme", pickerField("theme", "Theme", p.theme, themes, { vip, style: swatch })),
        group("Colors",
          `<div class="three">${colorField("colors.bg", "Background", p.colors.bg)}${colorField("colors.bg2", "Second", p.colors.bg2)}${colorField("colors.accent", "Accent", p.colors.accent)}</div>
           <div class="two">${colorField("colors.text", "Text", p.colors.text)}${colorField("colors.dim", "Soft text", p.colors.dim)}</div>`),
        group("Background",
          pickerField("bgType", "Style", p.bgType, BACKGROUNDS, { vip, style: swatch, note: "The background behind your page. Some of them are for VIP members." }) +
          (p.bgType === "gradient" ? rangeField("gradAngle", "Gradient angle", p.gradAngle, 0, 360, 5, "°") : "") +
          (p.bgType === "grid" ? rangeField("gridSize", "Grid square size", p.gridSize, 16, 100, 2, "px") + rangeField("gridPush", "How hard the cursor pushes", p.gridPush, 0, 100, 5, "%") : "") +
          (p.bgType === "particles" ? rangeField("density", "Amount of particles", p.density, 0.3, 2, 0.1, "×") : "") +
          (MOVING.includes(p.bgType) ? rangeField("bgSpeed", "Speed", p.bgSpeed, 0.2, 3, 0.1, "×") : "") +
          rangeField("bgDim", "Darken the background", p.bgDim, 0, 80, 5, "%")),
        vip || p.bgType === "image" ? group("Picture background",
          vipLock(textField("bgImage", "Image address", p.bgImage, { max: 500, placeholder: "https://…/picture.jpg" }) +
            rangeField("bgBlur", "Blur the picture", p.bgBlur, 0, 30, 1, "px") +
            `<p class="note">Paste a direct link to an image. Pick "Picture" above to show it.</p>`, vip)) : group("Picture background",
          vipLock(textField("bgImage", "Image address", "", { placeholder: "https://…/picture.jpg" }) + rangeField("bgBlur", "Blur the picture", 0, 0, 30, 1, "px"), vip)),
        group("Card",
          `<div class="two">${selectField("card.style", "Card", p.card.style, CARD_STYLES.map(c => [c, cap(c)] as const))}${selectField("card.align", "Align", p.card.align, ALIGNS.map(a => [a, cap(a)] as const))}</div>` +
          rangeField("card.radius", "Roundness", p.card.radius, 0, 48, 1, "px") +
          rangeField("card.blur", "Glass blur", p.card.blur, 0, 40, 1, "px") +
          rangeField("card.width", "Width", p.card.width, 320, 560, 10, "px") +
          rangeField("card.shadow", "Shadow", p.card.shadow, 0, 100, 5, "%") +
          toggle("card.border", "Thin border around the card", p.card.border) +
          (p.card.border ? selectField("card.borderColor", "Border color", p.card.borderColor, BORDER_COLORS.map(b => [b, b === "text" ? "Soft white" : "Accent color"] as const)) : "")),
        group("Text",
          selectField("font", "Font", p.font, FONT_KEYS.map(f => [f, FONTS[f].label] as const)) +
          `<div class="two">${rangeField("nameSize", "Name size", p.nameSize, 24, 72, 1, "px")}${selectField("nameWeight", "Name weight", String(p.nameWeight), [["500", "Regular"], ["600", "Semibold"], ["800", "Heavy"]], "num")}</div>` +
          `<div class="two">${rangeField("nameTracking", "Letter spacing", p.nameTracking, -6, 8, 1)}${selectField("nameCase", "Name case", p.nameCase, NAME_CASES.map(n => [n, n === "normal" ? "As typed" : n === "upper" ? "UPPERCASE" : "lowercase"] as const))}</div>` +
          rangeField("bioScale", "Bio text size", p.bioScale, 80, 130, 5, "%") +
          toggle("nameGlow", "Glow on the name", p.nameGlow) +
          toggle("nameGradient", "Gradient name", p.nameGradient)),
        group("Links", rangeField("linkGap", "Space between links", p.linkGap, 4, 28, 2, "px")),
        group("Motion",
          selectField("effects.entrance", "Entrance", p.effects.entrance, ENTRANCES.map(x => [x, cap(x)] as const)) +
          toggle("effects.tilt", "Card tilts toward the cursor", p.effects.tilt) +
          toggle("effects.cursorGlow", "Light follows the cursor", p.effects.cursorGlow)),
      ].join("");
    };
    draw();

    // A theme brings its own colours and background with it. A colour that was changed by
    // hand means the page is no longer that theme.
    const after = (path: string): boolean => {
      if (path === "theme") {
        const th = THEMES[store.profile.theme as ThemeName];
        if (th) {
          store.profile.colors = { ...th.colors };
          store.profile.bgType = th.bgType;
        }
      }
      if (path.startsWith("colors.")) store.profile.theme = "custom";
      return path === "bgType" || path === "card.border" || path === "theme";
    };

    const offs = [
      bindFields(el, after, draw),
      bindPickers(el, after, draw),
    ];
    return () => offs.forEach(fn => fn());
  },
};
