import { BOARD_H, BOARD_W, defaultBoard, kindOf, knownPiece, PAGE_KINDS, PAGE_WIDGETS } from "../../shared/constants";
import type { BoardBox, RenderModel } from "../../shared/types";
import { isVideoUrl } from "../../shared/url";
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
export function widgetHTML(id: string, m: RenderModel, box?: BoardBox): string {
  switch (kindOf(id)) {
    case "rail": return railHTML(m.profile.page.board, box);
    case "text": return `<div class="ftext">${box?.label ? `<h3>${esc(box.label)}</h3>` : ""}${box?.text ? `<p>${esc(box.text).replace(/\n/g, "<br>")}</p>` : ""}${box?.label || box?.text ? "" : `<p class="ftext-empty">Write something</p>`}</div>`;
    case "image": return box?.url && isVideoUrl(box.url) ? `<video class="fimg" src="${esc(box.url)}" aria-label="${esc(box.label ?? "")}" autoplay muted loop playsinline preload="metadata"></video>` : box?.url ? `<img class="fimg" src="${esc(box.url)}" alt="${esc(box.label ?? "")}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : `<div class="fimg-empty">Add a picture or video address, or choose a file</div>`;
    case "divider": return `<hr class="fdiv">`;
    case "page": return `<div class="fpage-in">${pageTitle(box)}</div>`;
    case "jump": return `<span class="fjump" role="button" tabindex="0" data-dir="${jumpUp(m.profile.page.board, box) ? "up" : "down"}" data-jump="${esc(box?.target ?? "top")}"><span>${esc(box?.label || "Scroll down")}</span><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg></span>`;
    case "profile": return `<div class="fhead">${shareHTML(m)}${headHTML(m)}</div>`;
    case "links": return linksHTML(m.profile);
    case "lyrics": return `<div class="pslot" data-slot="lyrics"></div>`;
    case "music": return `<div class="pslot" data-slot="music"></div>`;
    case "discord": return `<div class="pslot" data-slot="discord"></div>`;
    case "views": return viewsHTML(m);
    default: return "";
  }
}

/** Whether a button sends you up the page: its page is above the button. */
function jumpUp(board: readonly BoardBox[], box?: BoardBox): boolean {
  if (!box) return false;
  const target = box.target ?? "top";
  const y = target === "top" ? 0 : board.find(b => b.id === target)?.y ?? 0;
  return y < box.y;
}

/** The pages a rail points at: the top of the page, then every page panel, from the top down. */
export function railPages(board: readonly BoardBox[]): Array<{ id: string; label: string }> {
  const pages = board.filter(b => kindOf(b.id) === "page").sort((a, b) => a.y - b.y);
  return [{ id: "top", label: "Top" }, ...pages.map(b => ({ id: b.id, label: b.label || "Page" }))];
}

/** A rail: one mark for each page, the page you are on shown long. Pressing a mark scrolls to that page. */
export function railHTML(board: readonly BoardBox[], box?: BoardBox, active = 0): string {
  const items = railPages(board).map((p, i) => `<button type="button" class="frail-i${i === active ? " on" : ""}" data-jump="${esc(p.id)}" aria-label="${esc(p.label)}"><i></i></button>`).join("");
  return `<nav class="frail" data-look="${box?.look === "dot" ? "dot" : "bar"}" aria-label="Pages">${items}</nav>`;
}

/** The title of a page panel, if it has one. */
function pageTitle(box?: BoardBox): string {
  return box?.label ? `<h2 class="fpage-t">${esc(box.label)}</h2>` : `<span class="fpage-t fpage-empty"></span>`;
}

/** What a piece is called, for its label in the editor. */
export function pieceLabel(box: BoardBox): string {
  const kind = kindOf(box.id);
  const base = PAGE_WIDGETS.find(w => w.id === kind)?.label ?? PAGE_KINDS.find(k => k.kind === kind)?.label ?? box.id;
  return (kind === "page" || kind === "jump") && box.label ? `${base}: ${box.label}` : base;
}

/** The boxes to draw: the ones the owner set, or a tidy page if there are none. */
export function pageBoxes(boxes: readonly BoardBox[] | undefined): BoardBox[] {
  const list = (boxes ?? []).filter(b => knownPiece(b.id));
  return list.length ? list : defaultBoard();
}

/** The inside of a piece. */
export function boxInner(body: string): string {
  return `<div class="fbox-in">${body}</div>`;
}

/** One box of the board, with its place and size in CSS variables. */
export function boxHTML(b: BoardBox, body: string): string {
  return `<div class="fbox" data-widget="${esc(b.id)}" data-kind="${esc(kindOf(b.id))}" ${boxAttrs(b)} style="${boxVars(b)}">${boxInner(body)}</div>`;
}

/** The look a piece has on its own: how it is lined up and how it is filled. */
export function boxAttrs(b: BoardBox): string {
  const bits: string[] = [];
  if (b.align) bits.push(`data-align="${esc(b.align)}"`);
  if (b.fill) bits.push(`data-fill="${esc(b.fill)}"`);
  if (b.fixedH) bits.push(`data-fixed="true"`);
  if (b.look) bits.push(`data-look="${esc(b.look)}"`);
  if (b.valign) bits.push(`data-valign="${esc(b.valign)}"`);
  if (b.bg) bits.push(`data-cbg="1"`);
  if (b.bc) bits.push(`data-cbc="1"`);
  if (b.glow) bits.push(`data-glowp="1"`);
  if (b.hover && b.hover !== "none") bits.push(`data-hover="${esc(b.hover)}"`);
  if (b.anim && b.anim !== "none") bits.push(`data-anim="${esc(b.anim)}"`);
  if (b.float) bits.push(`data-float="1"`);
  if (b.hideMobile) bits.push(`data-hm="1"`);
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
  const set = (name: string, v: string | null): void => { if (v === null) el.style.removeProperty(name); else el.style.setProperty(name, v); };
  set("--op", typeof b.opacity === "number" ? String(b.opacity / 100) : null);
  set("--bl", typeof b.blur === "number" ? `${b.blur}px` : null);
  set("--bw-px", typeof b.borderW === "number" ? `${b.borderW}px` : null);
  set("--sh", typeof b.shadow === "number" ? String(b.shadow / 100) : null);
  set("--z", String(layerOf(b)));
  set("--pc", b.color ?? null);
  set("--ps", typeof b.size === "number" ? `${b.size}px` : null);
  const flag = (name: string, v: string | false | undefined): void => { if (v) el.dataset[name] = v; else delete el.dataset[name]; };
  flag("look", b.look);
  flag("valign", b.valign);
  flag("cbg", b.bg ? "1" : undefined);
  flag("cbc", b.bc ? "1" : undefined);
  flag("glowp", b.glow ? "1" : undefined);
  flag("hover", b.hover && b.hover !== "none" ? b.hover : undefined);
  flag("anim", b.anim && b.anim !== "none" ? b.anim : undefined);
  flag("float", b.float ? "1" : undefined);
  flag("hm", b.hideMobile ? "1" : undefined);
  set("--pb", b.bg ?? null);
  set("--pba", typeof b.bga === "number" ? `${b.bga}%` : null);
  set("--bs", b.bstyle ?? null);
  set("--bc", b.bc ?? null);
  set("--gl", typeof b.glow === "number" ? String(b.glow) : null);
  set("--rot", typeof b.rot === "number" ? `${b.rot}deg` : null);
  set("--zm", typeof b.zoom === "number" ? String(b.zoom / 100) : null);
}

/** The layer a piece is on: pages sit behind everything else unless the owner says otherwise. */
export function layerOf(b: BoardBox): number {
  return typeof b.z === "number" ? b.z : kindOf(b.id) === "page" ? 0 : 2;
}

/** Where a piece sits, how wide it is, and the room inside it. */
export function boxVars(b: BoardBox): string {
  const bits = [`--x:${b.x}px`, `--y:${b.y}px`, `--w:${b.w}px`, `--h:${b.fixedH ? `${b.h}px` : "auto"}`];
  if (typeof b.pad === "number") bits.push(`--pad:${b.pad}px`);
  if (typeof b.radius === "number") bits.push(`--radius:${b.radius}px`);
  if (typeof b.opacity === "number") bits.push(`--op:${b.opacity / 100}`);
  if (typeof b.blur === "number") bits.push(`--bl:${b.blur}px`);
  if (typeof b.borderW === "number") bits.push(`--bw-px:${b.borderW}px`);
  if (typeof b.shadow === "number") bits.push(`--sh:${b.shadow / 100}`);
  bits.push(`--z:${layerOf(b)}`);
  if (b.color) bits.push(`--pc:${b.color}`);
  if (b.bg) bits.push(`--pb:${b.bg}`);
  if (typeof b.bga === "number") bits.push(`--pba:${b.bga}%`);
  if (b.bstyle) bits.push(`--bs:${b.bstyle}`);
  if (b.bc) bits.push(`--bc:${b.bc}`);
  if (typeof b.glow === "number") bits.push(`--gl:${b.glow}`);
  if (typeof b.rot === "number") bits.push(`--rot:${b.rot}deg`);
  if (typeof b.zoom === "number") bits.push(`--zm:${b.zoom / 100}`);
  if (typeof b.size === "number") bits.push(`--ps:${b.size}px`);
  return bits.join(";");
}

/** The free-form page, ready to be dropped into the stage. */
export function freeHTML(m: RenderModel, boxes: readonly BoardBox[] | undefined): string {
  const list = pageBoxes(boxes);
  const parts = list.map(b => {
    // A rail docked to the side of the screen is drawn by the stage, outside the board.
    if (kindOf(b.id) === "rail" && (b.dock === "left" || b.dock === "right")) return "";
    const body = widgetHTML(b.id, m, b);
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

/**
 * Where a piece goes when the board is wider than it was made: pieces on the left stay left, pieces on the
 * right stay right and the ones in the middle stay in the middle. A piece that spans the board stretches.
 */
export function anchorShift(x: number, w: number, extra: number): { ex: number; ew: number } {
  if (extra <= 0) return { ex: 0, ew: 0 };
  if (x <= 24 && x + w >= BOARD_W - 24) return { ex: 0, ew: extra };
  const mid = x + w / 2;
  return { ex: mid < BOARD_W / 3 ? 0 : mid > (BOARD_W * 2) / 3 ? extra : extra / 2, ew: 0 };
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
  // On a screen wider than the board the board is made as wide as the screen, so a piece put at the
  // left or right edge is at the edge of the screen. Pieces on the left stay left, pieces on the right
  // stay right, and the ones in the middle stay in the middle.
  const avail = stage.querySelector<HTMLElement>(".scroll")?.clientWidth || stage.clientWidth;
  const wide = avail > BOARD_W;
  const k = wide ? 1 : boardScale(avail);
  const bw = wide ? avail : BOARD_W;
  const extra = bw - BOARD_W;
  canvas.style.setProperty("--bw", `${bw}px`);
  for (const b of canvas.querySelectorAll<HTMLElement>(".fbox")) {
    const x = parseFloat(b.style.getPropertyValue("--x")) || 0;
    const w = parseFloat(b.style.getPropertyValue("--w")) || 0;
    const { ex, ew } = anchorShift(x, w, extra);
    b.style.setProperty("--ex", `${ex}px`);
    b.style.setProperty("--ew", `${ew}px`);
  }
  const h = boardHeight(canvas);
  canvas.style.height = `${h}px`;
  canvas.style.transform = `scale(${k})`;
  scale.style.width = `${Math.round(bw * k)}px`;
  scale.style.height = `${Math.round(h * k)}px`;
}
