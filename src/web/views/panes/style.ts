import { ALIGNS, BG_TYPES, CARD_STYLES, ENTRANCES, FONT_KEYS, THEME_KEYS } from "../../../shared/types";
import { FONTS, THEMES } from "../../../shared/constants";
import { store } from "../../state";
import { delegate } from "../../util/dom";
import { bindFields, colorField, group, rangeField, selectField, toggle, type Pane } from "./fields";

const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1);

export const stylePane: Pane = {
  id: "style",
  label: "Style",
  mount(el) {
    const draw = (): void => {
      const p = store.profile;
      const themes = THEME_KEYS.map(k => {
        const t = THEMES[k];
        return `<button class="theme" type="button" data-theme="${k}" aria-pressed="${p.theme === k}"><i style="background:linear-gradient(135deg,${t.colors.bg},${t.colors.bg2});--ac:${t.colors.accent}"></i>${t.name}</button>`;
      }).join("");
      el.innerHTML = [
        group("Theme", `<div class="themes">${themes}</div>`),
        group("Colors",
          `<div class="three">${colorField("colors.bg", "Background", p.colors.bg)}${colorField("colors.bg2", "Second", p.colors.bg2)}${colorField("colors.accent", "Accent", p.colors.accent)}</div>
           <div class="two">${colorField("colors.text", "Text", p.colors.text)}${colorField("colors.dim", "Soft text", p.colors.dim)}</div>`),
        group("Background",
          selectField("bgType", "Background", p.bgType, BG_TYPES.map(b => [b, cap(b)] as const)) +
          (p.bgType === "gradient" ? rangeField("gradAngle", "Gradient angle", p.gradAngle, 0, 360, 5, "°") : "") +
          (p.bgType === "grid" ? rangeField("gridSize", "Grid square size", p.gridSize, 16, 100, 2, "px") + rangeField("gridPush", "How hard the cursor pushes", p.gridPush, 0, 100, 5, "%") : "") +
          (p.bgType === "particles" ? rangeField("density", "Amount of particles", p.density, 0.3, 2, 0.1, "×") : "")),
        group("Card",
          `<div class="two">${selectField("card.style", "Card", p.card.style, CARD_STYLES.map(c => [c, cap(c)] as const))}${selectField("card.align", "Align", p.card.align, ALIGNS.map(a => [a, cap(a)] as const))}</div>` +
          rangeField("card.radius", "Roundness", p.card.radius, 0, 48, 1, "px") +
          rangeField("card.blur", "Glass blur", p.card.blur, 0, 40, 1, "px") +
          rangeField("card.width", "Width", p.card.width, 320, 560, 10, "px") +
          toggle("card.border", "Thin border around the card", p.card.border)),
        group("Text",
          selectField("font", "Font", p.font, FONT_KEYS.map(f => [f, FONTS[f].label] as const)) +
          `<div class="two">${rangeField("nameSize", "Name size", p.nameSize, 24, 72, 1, "px")}${selectField("nameWeight", "Name weight", String(p.nameWeight), [["500", "Regular"], ["600", "Semibold"], ["800", "Heavy"]], "num")}</div>` +
          toggle("nameGlow", "Glow on the name", p.nameGlow) +
          toggle("nameGradient", "Gradient name", p.nameGradient)),
        group("Motion",
          selectField("effects.entrance", "Entrance", p.effects.entrance, ENTRANCES.map(x => [x, cap(x)] as const)) +
          toggle("effects.tilt", "Card tilts toward the cursor", p.effects.tilt) +
          toggle("effects.cursorGlow", "Light follows the cursor", p.effects.cursorGlow)),
      ].join("");
    };
    draw();

    const offs = [
      bindFields(el, path => {
        if (path.startsWith("colors.")) {
          store.profile.theme = "custom";
          el.querySelectorAll<HTMLElement>("[data-theme]").forEach(b => b.setAttribute("aria-pressed", "false"));
        }
        return path === "bgType";
      }, draw),
      delegate(el, "click", "[data-theme]", (_e, t) => {
        const key = t.dataset.theme as (typeof THEME_KEYS)[number];
        const th = THEMES[key];
        const p = store.profile;
        p.theme = key;
        p.colors = { ...th.colors };
        p.bgType = th.bgType;
        store.profileChanged();
        draw();
      }),
    ];
    return () => offs.forEach(fn => fn());
  },
};
