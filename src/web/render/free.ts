import { BOARD_H, BOARD_W, defaultBoard, PAGE_WIDGETS } from "../../shared/constants";
import type { BoardBox, RenderModel } from "../../shared/types";
import { esc } from "../util/dom";
import { headHTML, linksHTML, shareHTML, viewsHTML } from "./card";

/**
 * The page in the free-form layout.
 *
 * Every piece of the page sits in a box of its own, and the owner decides where the boxes
 * go. The board is a fixed size in pixels and the page is scaled to fit the screen, so the
 * arrangement looks the same on every device.
 */

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

/** One box of the board, with its place and size in CSS variables. */
export function boxHTML(b: BoardBox, body: string): string {
  return `<div class="fbox" data-widget="${esc(b.id)}" style="--x:${b.x}px;--y:${b.y}px;--w:${b.w}px;--h:${b.h}px">${body}</div>`;
}

/** The free-form page, ready to be dropped into the stage. */
export function freeHTML(m: RenderModel, boxes: readonly BoardBox[] | undefined): string {
  const list = pageBoxes(boxes);
  const parts = list.map(b => {
    const body = widgetHTML(b.id, m);
    if (!body) return "";
    return boxHTML(b, body);
  });
  return `<div class="free-scale"><div class="free" style="--bw:${BOARD_W}px;--bh:${BOARD_H}px">${parts.join("")}</div></div>`;
}

/**
 * How big the board can be in the space it has.
 *
 * The board keeps its shape, so it is scaled to fit whichever way is tighter: `pad` is the
 * room left on each side, and `top` is the room for the bar that floats over a public page.
 */
export function boardScale(spaceW: number, spaceH: number, pad = 0, top = 0): number {
  const k = Math.min((spaceW - pad) / BOARD_W, (spaceH - top) / BOARD_H);
  return Math.min(1, Math.max(0.3, k));
}

/**
 * Fit the board to the space it has. Small screens get the pieces stacked in a column
 * instead, because a board scaled down to a third is unreadable.
 */
export function fitFree(stage: HTMLElement): void {
  const scale = stage.querySelector<HTMLElement>(".free-scale");
  const canvas = stage.querySelector<HTMLElement>(".free");
  if (!scale || !canvas) return;
  if (!stage.clientWidth) return;

  const narrow = stage.clientWidth < 600;
  stage.classList.toggle("is-stacked", narrow);
  if (narrow) {
    scale.style.width = "";
    scale.style.height = "";
    canvas.style.transform = "";
    return;
  }
  // The bar at the top of a public page sits over the board, so room is left for it.
  const k = boardScale(stage.clientWidth, stage.clientHeight, 32, 88);
  canvas.style.transform = `scale(${k})`;
  scale.style.width = `${Math.round(BOARD_W * k)}px`;
  scale.style.height = `${Math.round(BOARD_H * k)}px`;
}
