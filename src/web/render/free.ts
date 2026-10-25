import { BOARD_H, BOARD_W, defaultBoard, PAGE_WIDGETS } from "../../shared/constants";
import type { BoardBox, RenderModel } from "../../shared/types";
import { esc } from "../util/dom";
import { headHTML, linksHTML, shareHTML, viewsHTML } from "./card";

/**
 * The page in the free-form layout.
 *
 * Every piece of the page sits in a box of its own, and the owner decides where each box goes
 * and how wide it is. A box is as tall as what is inside it (unless the owner fixed its
 * height), and what is inside is never scaled: it is laid out at its own size, the way it is
 * on the usual page. The board is 1200 wide; on a narrower screen the whole board is scaled
 * down to the screen's width and the page scrolls down. On a phone the pieces are stacked.
 */

/** Narrower than this and the board is stacked in a column instead of scaled down. */
export const STACK_BELOW = 720;

/** The pieces of the page, and what goes inside each one. */
export function widgetHTML(id: string, m: RenderModel): string {
  switch (id) {
    case "profile": return `<div class="fhead">${shareHTML(m)}${headHTML(m)}</div>`;
    case "links": return linksHTML(m.profile);
    case "music": return `<div class="pslot" data-slot="music"></div>`;
    case "discord": return `<div class="pslot" data-slot="discord"></div>`;
    case "views": return viewsHTML(m);
    default: return "";
  }
}

/** The boxes to draw: the ones the owner set, or a tidy page if there are none. */
export function pageBoxes(boxes: readonly BoardBox[] | undefined): BoardBox[] {
  const known = new Set<string>(PAGE_WIDGETS.map(w => w.id));
  const list = (boxes ?? []).filter(b => known.has(b.id));
  return list.length ? list : defaultBoard();
}

/** The inside of a piece. */
export function boxInner(body: string): string {
  return `<div class="fbox-in">${body}</div>`;
}

/** One box of the board, with its place and size in CSS variables. */
export function boxHTML(b: BoardBox, body: string): string {
  return `<div class="fbox" data-widget="${esc(b.id)}" ${boxAttrs(b)} style="${boxVars(b)}">${boxInner(body)}</div>`;
}

/** The look a piece has on its own: how it is lined up and how it is filled. */
export function boxAttrs(b: BoardBox): string {
  const bits: string[] = [];
  if (b.align) bits.push(`data-align="${esc(b.align)}"`);
  if (b.fill) bits.push(`data-fill="${esc(b.fill)}"`);
  if (b.fixedH) bits.push(`data-fixed="true"`);
  return bits.join(" ");
}

/** The same look, put on a piece that is already on the page. */
export function applyBoxLook(el: HTMLElement, b: BoardBox): void {
  if (b.align) el.dataset.align = b.align; else delete el.dataset.align;
  if (b.fill) el.dataset.fill = b.fill; else delete el.dataset.fill;
  if (b.fixedH) el.dataset.fixed = "true"; else delete el.dataset.fixed;
  el.style.setProperty("--h", b.fixedH ? `${b.h}px` : "auto");
  if (typeof b.pad === "number") el.style.setProperty("--pad", `${b.pad}px`); else el.style.removeProperty("--pad");
  if (typeof b.radius === "number") el.style.setProperty("--radius", `${b.radius}px`); else el.style.removeProperty("--radius");
}

/** Where a piece sits, how wide it is, and the room inside it. */
export function boxVars(b: BoardBox): string {
  const bits = [`--x:${b.x}px`, `--y:${b.y}px`, `--w:${b.w}px`, `--h:${b.fixedH ? `${b.h}px` : "auto"}`];
  if (typeof b.pad === "number") bits.push(`--pad:${b.pad}px`);
  if (typeof b.radius === "number") bits.push(`--radius:${b.radius}px`);
  return bits.join(";");
}

/** The free-form page, ready to be dropped into the stage. */
export function freeHTML(m: RenderModel, boxes: readonly BoardBox[] | undefined): string {
  const list = pageBoxes(boxes);
  const parts = list.map(b => {
    const body = widgetHTML(b.id, m);
    if (!body) return "";
    return boxHTML(b, body);
  });
  return `<div class="free-scale"><div class="free" style="--bw:${BOARD_W}px">${parts.join("")}</div></div>`;
}

/** How tall the board has to be to hold every piece on it, with room below the last one. */
export function boardHeight(canvas: HTMLElement, least = BOARD_H): number {
  let bottom = 0;
  for (const box of canvas.querySelectorAll<HTMLElement>(".fbox")) {
    bottom = Math.max(bottom, box.offsetTop + box.offsetHeight);
  }
  return Math.max(least, Math.ceil(bottom + 40));
}

/** How big the board is drawn: as wide as the space allows, never bigger than it is. */
export function boardScale(spaceW: number): number {
  return Math.min(1, Math.max(0.3, spaceW / BOARD_W));
}

/**
 * Fit the board to the space it has. The board is scaled to the width of the screen and grows
 * downward, so the page scrolls. A narrow screen gets the pieces stacked in a column instead,
 * because a board scaled down to a third is unreadable.
 */
export function fitFree(stage: HTMLElement): void {
  const scale = stage.querySelector<HTMLElement>(".free-scale");
  const canvas = stage.querySelector<HTMLElement>(".free");
  if (!scale || !canvas) return;
  if (!stage.clientWidth) return;

  const narrow = stage.clientWidth < STACK_BELOW;
  stage.classList.toggle("is-stacked", narrow);
  if (narrow) {
    // The pieces follow each other from the top of the board to the bottom, left to right.
    const boxes = [...canvas.querySelectorAll<HTMLElement>(".fbox")];
    boxes.sort((a, b) => (a.offsetTop - b.offsetTop) || (a.offsetLeft - b.offsetLeft));
    boxes.forEach((b, i) => b.style.setProperty("--o", String(i)));
    scale.style.width = "";
    scale.style.height = "";
    canvas.style.transform = "";
    canvas.style.height = "";
    return;
  }
  // The room on each side, and the bar that floats over the top of a public page.
  const k = boardScale(stage.clientWidth - 32);
  const h = boardHeight(canvas);
  canvas.style.height = `${h}px`;
  canvas.style.transform = `scale(${k})`;
  scale.style.width = `${Math.round(BOARD_W * k)}px`;
  scale.style.height = `${Math.round(h * k)}px`;
}
