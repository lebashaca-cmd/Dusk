import type { Profile } from "../../../shared/types";
import { delegate, esc, getPath, setPath } from "../../util/dom";
import { store } from "../../state";

/* Form pieces that read and write a value in the profile by its path, e.g. "card.radius". */

export interface Pane {
  id: string;
  label: string;
  /** One line about what this section is for. Shown under the title. */
  hint?: string;
  /** A pane that wants the whole width, not just the form column. */
  wide?: boolean;
  /** Draw the pane into `el`. Returns a function that tears it down. */
  mount(el: HTMLElement): () => void;
}

export function group(title: string, body: string): string {
  return `<section class="grp"><h3>${esc(title)}</h3>${body}</section>`;
}

export function textField(path: string, label: string, value: unknown, o: { max?: number; placeholder?: string } = {}): string {
  return `<label class="fld">${esc(label)}<input type="text" data-p="${path}" data-t="text" value="${esc(value)}"${o.max ? ` maxlength="${o.max}"` : ""}${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ""}></label>`;
}

export function areaField(path: string, label: string, value: unknown, o: { max?: number; placeholder?: string } = {}): string {
  return `<label class="fld">${esc(label)}<textarea data-p="${path}" data-t="text"${o.max ? ` maxlength="${o.max}"` : ""}${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ""}>${esc(value)}</textarea></label>`;
}

export function rangeField(path: string, label: string, value: number, min: number, max: number, step = 1, unit = ""): string {
  return `<label class="fld">${esc(label)}<em>${value}${unit}</em><input type="range" data-p="${path}" data-t="num" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
}

export function selectField(path: string, label: string, value: string, options: ReadonlyArray<readonly [string, string]>, kind: "text" | "num" = "text"): string {
  return `<label class="fld">${esc(label)}<select data-p="${path}" data-t="${kind}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(value) === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
}

export function toggle(path: string, label: string, value: boolean): string {
  return `<label class="sw"><span>${esc(label)}</span><input type="checkbox" data-p="${path}" data-t="bool"${value ? " checked" : ""}></label>`;
}

export function colorField(path: string, label: string, value: string): string {
  return `<label class="clr">${esc(label)}<input type="color" data-p="${path}" data-t="color" value="${esc(value)}"></label>`;
}

export interface Choice {
  value: string;
  label: string;
  /** Only VIP members may pick this one. */
  vip?: boolean;
  /** Class for the little preview picture (see dashboard.css). */
  pv?: string;
}

/** How lyrics are shown. The Dynamic Island is for VIP members. */
export const LYRIC_CHOICES: readonly Choice[] = [
  { value: "panel", label: "Panel", pv: "lyr-panel" },
  { value: "island", label: "Dynamic Island", vip: true, pv: "lyr-island" },
];

/**
 * A grid of picture buttons. A VIP-only choice is blurred with "VIP" over it for regular members,
 * and clicking it does nothing but tell them what it is.
 */
export function choiceGrid(path: string, label: string, value: string, choices: readonly Choice[], vip: boolean, o: { cols?: number; style?: string } = {}): string {
  const locked = (c: Choice): boolean => Boolean(c.vip) && !vip;
  return `<div class="fld"><span>${esc(label)}</span>
    <div class="choices" style="--cols:${o.cols ?? 3};${o.style ?? ""}" data-choices="${path}">${choices.map(c => `<button type="button" class="choice${locked(c) ? " locked" : ""}" data-choice="${path}" data-value="${esc(c.value)}" aria-pressed="${String(value) === c.value}"${locked(c) ? ' aria-disabled="true"' : ""} title="${esc(c.label)}${locked(c) ? " (VIP only)" : ""}">
      <i class="pv pv-${esc(c.pv ?? c.value)}"></i><span>${esc(c.label)}</span>${locked(c) ? '<b class="vip-tag">VIP</b>' : ""}</button>`).join("")}</div>
    ${choices.some(locked) ? '<p class="note vip-hint" hidden>This one is for VIP members.</p>' : ""}</div>`;
}

/** Wrap a control so regular members see it blurred, with "VIP" on top, and can't touch it. */
export function vipLock(html: string, vip: boolean): string {
  if (vip) return html;
  return `<div class="vip-lock" title="VIP only"><div class="vip-lock-in" inert aria-hidden="true">${html}</div><b class="vip-tag">VIP</b></div>`;
}

/**
 * Listens for every [data-p] control inside `el` and writes its value into the profile.
 * `after` runs once the profile is updated; return true from it to redraw the pane.
 */
export function bindFields(el: HTMLElement, after?: (path: string) => boolean | void, redraw?: () => void): () => void {
  const handle = (_e: Event, t: HTMLElement): void => {
    const input = t as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const path = input.dataset.p;
    if (!path) return;
    const kind = input.dataset.t;
    let value: unknown;
    if (kind === "bool") value = (input as HTMLInputElement).checked;
    else if (kind === "num") value = Number(input.value);
    else value = input.value;
    setPath(store.profile, path, value);
    const label = input.closest(".fld")?.querySelector("em");
    if (label) label.textContent = `${input.value}${input.dataset.unit ?? ""}`;
    const again = after?.(path);
    store.profileChanged();
    if (again && redraw) redraw();
  };
  const pick = (_e: Event, t: HTMLElement): void => {
    const path = t.dataset.choice;
    if (!path) return;
    if (t.classList.contains("locked")) {
      const hint = t.closest(".fld")?.querySelector<HTMLElement>(".vip-hint");
      if (hint) hint.hidden = false;
      t.classList.remove("nudge");
      void t.offsetWidth;
      t.classList.add("nudge");
      return;
    }
    setPath(store.profile, path, t.dataset.value ?? "");
    t.closest(".choices")?.querySelectorAll<HTMLElement>("[data-choice]").forEach(b => b.setAttribute("aria-pressed", String(b === t)));
    const again = after?.(path);
    store.profileChanged();
    if (again && redraw) redraw();
  };
  const off3 = delegate(el, "click", "[data-choice]", pick);
  const off1 = delegate(el, "input", "[data-p]:not(select):not([type=checkbox])", handle);
  const off2 = delegate(el, "change", "select[data-p], input[type=checkbox][data-p]", handle);
  return () => { off1(); off2(); off3(); };
}

export const read = (path: string): unknown => getPath(store.profile, path);
export type { Profile };
