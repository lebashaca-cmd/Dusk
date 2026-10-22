import { BRANDS } from "../../../shared/brands";
import { ICON_COLORS, ICON_NAMES, LINK_HOVERS, LINK_LAYOUTS, type IconName } from "../../../shared/types";
import { LIMITS, LINK_PRESETS, newId } from "../../../shared/constants";
import { store } from "../../state";
import { icon } from "../../ui/icons";
import { delegate, esc } from "../../util/dom";
import { bindFields, group, selectField, type Pane } from "./fields";

const COLOR_LABEL: Record<(typeof ICON_COLORS)[number], string> = { theme: "Page text color", accent: "Accent color", brand: "Each brand's own color" };
const HOVER_LABEL: Record<(typeof LINK_HOVERS)[number], string> = { lift: "Lift up", glow: "Glow", none: "Nothing" };
const iconLabel = (n: string): string => (n === "auto" ? "Automatic (from the link)" : (BRANDS as Record<string, { title: string } | undefined>)[n]?.title ?? n[0]!.toUpperCase() + n.slice(1));

const LAYOUT_LABEL: Record<(typeof LINK_LAYOUTS)[number], string> = { rows: "Rows", pills: "Pills", icons: "Icons only", grid: "Grid" };

export const linksPane: Pane = {
  id: "links",
  label: "Links",
  hint: "The things you want people to open.",
  mount(el) {
    const draw = (): void => {
      const p = store.profile;
      const groupOptions: ReadonlyArray<readonly [string, string]> = [
        ["", "No group"],
        ...p.groups.map(g => [g.id, g.label.trim() || "Untitled group"] as const),
      ];
      const cards = p.links.map((l, i) => `<div class="card-ed" data-i="${i}">
        <div class="row">${icon(l.icon)}<b class="sp">${esc(l.label || `Link ${i + 1}`)}</b>
          <button class="icon-btn" type="button" data-move="-1" aria-label="Move up"${i === 0 ? " disabled" : ""}>${icon("up")}</button>
          <button class="icon-btn" type="button" data-move="1" aria-label="Move down"${i === p.links.length - 1 ? " disabled" : ""}>${icon("down")}</button>
          <button class="icon-btn del" type="button" data-del aria-label="Delete link">${icon("trash")}</button></div>
        <div class="two">
          <label class="fld">Title<input type="text" data-p="links.${i}.label" data-t="text" value="${esc(l.label)}" maxlength="40"></label>
          ${selectField(`links.${i}.icon`, "Icon", l.icon, ICON_NAMES.map(n => [n, iconLabel(n)] as const))}
        </div>
        <label class="fld">Address<input type="text" data-p="links.${i}.url" data-t="text" value="${esc(l.url)}" placeholder="https://" maxlength="300"></label>
        <label class="fld">Small text (optional)<input type="text" data-p="links.${i}.note" data-t="text" value="${esc(l.note)}" maxlength="60"></label>
        ${selectField(`links.${i}.group`, "Sits under", l.group ?? "", groupOptions)}
      </div>`).join("");
      el.innerHTML = group("Your links",
        `<div class="chips">${LINK_PRESETS.map((x, n) => `<button class="chip" type="button" data-preset="${n}">+ ${esc(x.label)}</button>`).join("")}</div>
         ${cards || `<p class="note">No links yet. Pick one above or add a blank one.</p>`}
         <button class="btn-ghost" type="button" data-add style="justify-content:center"${p.links.length >= LIMITS.links ? " disabled" : ""}>+ Add a link</button>`) +
        group("Layout",
          selectField("linkLayout", "Show links as", p.linkLayout, LINK_LAYOUTS.map(l => [l, LAYOUT_LABEL[l]] as const)) +
          selectField("iconColor", "Icon color", p.iconColor, ICON_COLORS.map(c => [c, COLOR_LABEL[c]] as const)) +
          `<p class="note">Icons follow your theme. With brand colors, a logo that would disappear into your background uses your text color instead.</p>` +
          selectField("linkHover", "When someone hovers a link", p.linkHover, LINK_HOVERS.map(h => [h, HOVER_LABEL[h]] as const)));
    };
    draw();

    const add = (label: string, ic: IconName): void => {
      const links = store.profile.links;
      if (links.length >= LIMITS.links) return;
      links.push({ id: newId(), label, url: "", note: "", icon: ic });
      store.profileChanged();
      draw();
    };
    const index = (t: HTMLElement): number => Number(t.closest<HTMLElement>("[data-i]")?.dataset.i);

    const offs = [
      bindFields(el, path => path.endsWith(".icon") || path.endsWith(".group"), draw),
      delegate(el, "click", "[data-add]", () => add("", "auto")),
      delegate(el, "click", "[data-preset]", (_e, t) => {
        const preset = LINK_PRESETS[Number(t.dataset.preset)];
        if (preset) add(preset.label, preset.icon);
      }),
      delegate(el, "click", "[data-del]", (_e, t) => { store.profile.links.splice(index(t), 1); store.profileChanged(); draw(); }),
      delegate(el, "click", "[data-move]", (_e, t) => {
        const i = index(t);
        const j = i + Number(t.dataset.move);
        const links = store.profile.links;
        const a = links[i];
        const b = links[j];
        if (!a || !b) return;
        links[i] = b;
        links[j] = a;
        store.profileChanged();
        draw();
      }),
    ];
    return () => offs.forEach(fn => fn());
  },
};
