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
  return `<div class="fbox" data-widget="${esc(b.id)}" ${boxAttrs(b)} style="${boxVars(b)}">${boxInner(body)}</div>`;
}

/** The inside of a piece: the content, wrapped so it can be scaled to fit the piece. */
export function boxInner(body: string): string {
  return `<div class="fbox-fit"><div class="fbox-box"><div class="fbox-in">${body}</div></div></div>`;
}

/** The look a piece has on its own: how it is lined up and how it is filled. */
export function boxAttrs(b: BoardBox): string {
  const bits: string[] = [];
  if (b.align) bits.push(`data-align="${esc(b.align)}"`);
  if (b.fill) bits.push(`data-fill="${esc(b.fill)}"`);
  if (b.fit) bits.push(`data-fit="${esc(b.fit)}"`);
  return bits.join(" ");
}

/** The same look, put on a piece that is already on the page. */
export function applyBoxLook(el: HTMLElement, b: BoardBox): void {
  if (b.align) el.dataset.align = b.align; else delete el.dataset.align;
  if (b.fill) el.dataset.fill = b.fill; else delete el.dataset.fill;
  if (b.fit) el.dataset.fit = b.fit; else delete el.dataset.fit;
  if (typeof b.pad === "number") el.style.setProperty("--pad", `${b.pad}px`); else el.style.removeProperty("--pad");
  if (typeof b.radius === "number") el.style.setProperty("--radius", `${b.radius}px`); else el.style.removeProperty("--radius");
}

/** Where a piece sits, how big it is, and the room inside it. */
export function boxVars(b: BoardBox): string {
  const bits = [`--x:${b.x}px`, `--y:${b.y}px`, `--w:${b.w}px`, `--h:${b.h}px`];
  if (typeof b.pad === "number") bits.push(`--pad:${b.pad}px`);
  if (typeof b.radius === "number") bits.push(`--radius:${b.radius}px`);
  return bits.join(";");
}

/** The smallest a piece's content is ever scaled to, so it always stays readable. */
const MIN_SCALE = 0.4;

/**
 * Scale what is inside each piece so that it fits the piece.
 *
 * A piece can be made any size, and the content in it is drawn at the size it wants. Left
 * alone it would hang out of the piece, so it is measured and scaled to fit, keeping its
 * shape. A piece that is too small for its content keeps the content readable and lets it
 * scroll inside.
 */
export function fitBoxes(root: HTMLElement): void {
  for (const box of root.querySelectorAll<HTMLElement>(".fbox")) {
    fitBox(box);
  }
}

/** The same, for one piece. */
export function fitBox(box: HTMLElement): void {
  const inner = box.querySelector<HTMLElement>(".fbox-in");
  const holder = box.querySelector<HTMLElement>(".fbox-box");
  const fit = box.querySelector<HTMLElement>(".fbox-fit");
  if (!inner || !holder || !fit) return;

  // On a narrow screen the pieces are stacked and their height follows the content,
  // so there is no box to scale the content into: it is simply laid out.
  if (box.closest(".is-stacked")) {
    inner.style.width = "";
    inner.style.height = "";
    inner.style.transform = "";
    holder.style.width = "";
    holder.style.height = "";
    return;
  }

  const cs = getComputedStyle(fit);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const availW = fit.clientWidth - padX;
  const availH = fit.clientHeight - padY;
  if (availW <= 0 || availH <= 0) return;

  // The content is measured at the width it has inside the piece's own room, so a piece
  // that is the size it started at shows its content at its own size, and a piece that
  // is made bigger or smaller shows its content bigger or smaller to match.
  const widget = PAGE_WIDGETS.find(w => w.id === box.dataset.widget);
  const natW = Math.max(120, (widget?.w ?? 320) - padX);
  inner.style.width = `${natW}px`;
  inner.style.height = "auto";
  inner.style.transform = "none";
  const natH = inner.offsetHeight;
  if (!natH) return;

  // The content is scaled to fit, but it is never made so small that it cannot be read.
  // Anything that still does not fit is scrolled inside the piece. A piece that is set to
  // keep its size is never scaled at all.
  const k = box.dataset.fit === "fixed" ? 1 : Math.max(MIN_SCALE, Math.min(availW / natW, availH / natH));
  inner.style.height = `${natH}px`;
  inner.style.transform = `scale(${k})`;
  // The holder is the size of the scaled content, so the piece scrolls over the content
  // and never over it.
  holder.style.width = `${Math.ceil(natW * k)}px`;
  holder.style.height = `${Math.ceil(natH * k)}px`;
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
