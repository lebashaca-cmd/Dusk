import type { BoardBox } from "../../../shared/types";
import { BOARD_W } from "../../../shared/constants";

/**
 * Moving and resizing pieces on the page board.
 *
 * Everything here happens in what is on screen: where a piece is drawn, in board pixels, on a board
 * that is as wide as the screen. Only when the piece is let go is that turned back into the box the
 * profile keeps (`toModel`). Nothing is rounded to the saved form on the way, so what you see while you
 * drag is what you get when you let go.
 */

export const GRID = 8;
export const MIN_W = 24;
export const MIN_H = 16;
export const MAX_Y = 4000;
/** How close, on screen, an edge has to be to a line before it jumps onto it. */
const SNAP = 7;
/** How far the pointer must travel before a press becomes a drag, so a click stays a click. */
const START = 4;

type Anc = NonNullable<BoardBox["anc"]>;
export interface Placed { x: number; w: number; anc: Anc }

/** How far each side holds on to the edge of a wider board: left none, middle half, right all. */
const shiftOf = (anc: Anc, extra: number): number => (anc === "l" || anc === "s" ? 0 : anc === "c" ? extra / 2 : extra);

/**
 * Turn a piece as drawn (left edge, right edge) into the box the profile keeps. The side it holds on to
 * is the nearest one it fits, so a piece near the left stays left, one near the right stays right.
 * A wide piece that reaches the right edge keeps its left side and stretches to that edge.
 */
export function toModel(left: number, right: number, bw: number, fixedWidth = false): Placed {
  const extra = Math.max(0, bw - BOARD_W);
  const width = right - left;
  if (!fixedWidth && right >= bw - 1 && width > BOARD_W / 2 && left <= BOARD_W - MIN_W) {
    const x = Math.max(0, Math.round(left));
    return { x, w: BOARD_W - x, anc: "s" };
  }
  const mid = (left + right) / 2;
  const order: Anc[] = mid < bw / 3 ? ["l", "c", "r"] : mid > (bw * 2) / 3 ? ["r", "c", "l"] : mid < bw / 2 ? ["c", "l", "r"] : ["c", "r", "l"];
  const fits = (a: Anc): boolean => {
    const x = left - shiftOf(a, extra);
    return x >= -0.5 && x + width <= BOARD_W + 0.5;
  };
  const anc = order.find(fits) ?? order[0]!;
  const w = Math.max(MIN_W, Math.min(BOARD_W, Math.round(width)));
  const x = Math.max(0, Math.min(BOARD_W - w, Math.round(left - shiftOf(anc, extra))));
  return { x, w, anc };
}

/** The nearest left edge a piece this wide can really have on a board this wide. */
export function nearestLeft(left: number, width: number, bw: number): number {
  const extra = Math.max(0, bw - BOARD_W);
  const spans = [0, extra / 2, extra].map(s => [s, s + BOARD_W - width] as const).filter(([a, b]) => b >= a);
  if (!spans.length) return Math.max(0, Math.min(bw - width, left));
  let best = left;
  let gap = Infinity;
  for (const [a, b] of spans) {
    const v = Math.max(a, Math.min(b, left));
    const d = Math.abs(v - left);
    if (d < gap) { gap = d; best = v; }
  }
  return best;
}

/** The farthest right edge a piece can have, with its left edge where it is. */
function farthestRight(left: number, bw: number): number {
  const extra = Math.max(0, bw - BOARD_W);
  let far = left + MIN_W;
  for (const s of [0, extra / 2, extra]) if (left >= s - 0.5) far = Math.max(far, s + BOARD_W);
  return Math.min(bw, far);
}

/** The farthest left edge a piece can have, with its right edge where it is. */
function farthestLeft(right: number, bw: number): number {
  const extra = Math.max(0, bw - BOARD_W);
  let far = right - MIN_W;
  for (const s of [0, extra / 2, extra]) if (right <= s + BOARD_W + 0.5) far = Math.min(far, s);
  return Math.max(0, far);
}

export interface MoveHost {
  canvas: HTMLElement;
  /** How much smaller the board is drawn than it is. */
  scale: () => number;
  /** How wide the board is drawn. */
  width: () => number;
  /** The pieces that stand on the board itself. */
  boxes: () => BoardBox[];
  cardOf: (id: string) => HTMLElement | null;
  /** The piece was changed: keep it, draw it where it belongs. */
  commit: (box: BoardBox, changed: boolean) => void;
  /** A press that was not a drag. Nothing happened to the piece. */
  tap: (id: string) => void;
  /** Called on every step, so the board can keep up with a piece that grew. */
  tick: () => void;
  /** The box that scrolls while a piece is dragged to its edge. */
  scroller: () => HTMLElement | null;
}

type Dir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const HANDLES: Dir[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Wire up pressing on the board. Returns what undoes it. */
export function attachMoves(host: MoveHost): () => void {
  const { canvas } = host;
  let raf = 0;
  let drag: null | {
    id: string; tapId: string; card: HTMLElement; box: BoardBox; dir: Dir | null; pointer: number;
    sx: number; sy: number; started: boolean;
    grabX: number; grabY: number;
    l0: number; t0: number; r0: number; b0: number;
    xs: number[]; ys: number[];
    cx: number; cy: number; free: boolean;
    l: number; t: number; r: number; b: number;
    guides: HTMLElement | null; read: HTMLElement | null;
    vertical: boolean; hitX: number[]; hitY: number[];
  } = null;

  const topCard = (t: EventTarget | null): HTMLElement | null => {
    let c = t instanceof Element ? t.closest<HTMLElement>(".fbox") : null;
    while (c && c.parentElement !== canvas) c = c.parentElement?.closest<HTMLElement>(".fbox") ?? null;
    return c;
  };

  const toBoard = (cx: number, cy: number): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    const k = host.scale();
    return { x: (cx - r.left) / k, y: (cy - r.top) / k };
  };

  /** The lines a piece can land on: the edges and middle of the board and of every other piece. */
  const lines = (except: HTMLElement): { xs: number[]; ys: number[] } => {
    const bw = host.width();
    const xs = [0, bw / 2, bw];
    const ys = [0];
    for (const b of host.boxes()) {
      const c = host.cardOf(b.id);
      if (!c || c === except) continue;
      xs.push(c.offsetLeft, c.offsetLeft + c.offsetWidth / 2, c.offsetLeft + c.offsetWidth);
      ys.push(c.offsetTop, c.offsetTop + c.offsetHeight / 2, c.offsetTop + c.offsetHeight);
    }
    return { xs, ys };
  };

  /** The value the given points are nearest to a line, moved onto it; or the grid when no line is near. */
  const snapTo = (points: number[], targets: number[], hits: number[], grid: boolean): number => {
    const near = SNAP / host.scale();
    let best = 0;
    let gap = near;
    let found = false;
    for (const p of points) {
      for (const t of targets) {
        const d = t - p;
        if (Math.abs(d) < Math.abs(gap) || (!found && Math.abs(d) <= near)) { gap = d; best = d; found = true; }
      }
    }
    if (found) {
      for (const p of points) for (const t of targets) if (Math.abs(t - p - best) < 0.5) hits.push(t);
      return best;
    }
    if (grid) { const g = Math.round(points[0]! / GRID) * GRID; return g - points[0]!; }
    return 0;
  };

  const ensureLayers = (d: NonNullable<typeof drag>): void => {
    if (d.guides) return;
    d.guides = document.createElement("div");
    d.guides.className = "pb-guides";
    d.read = document.createElement("div");
    d.read.className = "pb-read";
    canvas.append(d.guides, d.read);
    canvas.classList.add("is-moving");
    d.card.classList.add("dragging");
  };

  const paint = (d: NonNullable<typeof drag>): void => {
    const bw = host.width();
    d.card.style.left = `${d.l}px`;
    d.card.style.top = `${d.t}px`;
    d.card.style.width = `${d.r - d.l}px`;
    if (d.vertical || d.box.fixedH) d.card.style.height = `${d.b - d.t}px`;
    if (d.guides) {
      const h = canvas.offsetHeight;
      d.guides.innerHTML =
        [...new Set(d.hitX)].map(x => `<i class="pb-gv" style="left:${x}px;height:${h}px"></i>`).join("") +
        [...new Set(d.hitY)].map(y => `<i class="pb-gh" style="top:${y}px;width:${bw}px"></i>`).join("");
    }
    if (d.read) {
      const above = d.t > 34 / host.scale();
      d.read.textContent = `${Math.round(d.l)}, ${Math.round(d.t)}  ·  ${Math.round(d.r - d.l)} × ${Math.round(d.card.offsetHeight)}`;
      d.read.style.left = `${Math.max(0, Math.min(bw - 150, d.l))}px`;
      d.read.style.top = above ? `${d.t - 30 / host.scale()}px` : `${d.b + 8 / host.scale()}px`;
    }
    host.tick();
  };

  const step = (): void => {
    raf = 0;
    const d = drag;
    if (!d || !d.started) return;
    const bw = host.width();
    const k = host.scale();
    // Near the top or bottom of the screen the page scrolls on its own, so a piece can be taken as far as it can go.
    const box = host.scroller();
    if (box) {
      const edge = box === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : { top: box.getBoundingClientRect().top, bottom: box.getBoundingClientRect().bottom };
      const zone = 56;
      const up = d.cy - Math.max(edge.top, 0);
      const down = Math.min(edge.bottom, window.innerHeight) - d.cy;
      if (up < zone) box.scrollTop -= Math.ceil((zone - Math.max(up, 0)) / 4);
      else if (down < zone) box.scrollTop += Math.ceil((zone - Math.max(down, 0)) / 4);
      if (up < zone || down < zone) raf = requestAnimationFrame(step);
    }
    const p = toBoard(d.cx, d.cy);
    d.hitX = [];
    d.hitY = [];
    const snap = !d.free;
    const dir = d.dir;
    let { l, t, r, b } = { l: d.l0, t: d.t0, r: d.r0, b: d.b0 };
    if (!dir) {
      // Moving: the piece keeps the place on it that was picked up.
      const w = d.r0 - d.l0;
      const h = d.b0 - d.t0;
      l = p.x - d.grabX;
      t = p.y - d.grabY;
      if (snap) {
        l += snapTo([l, l + w / 2, l + w], d.xs, d.hitX, true);
        t += snapTo([t, t + h / 2, t + h], d.ys, d.hitY, true);
      }
      l = nearestLeft(l, w, bw);
      t = Math.max(0, Math.min(MAX_Y - h, t));
      r = l + w;
      b = t + h;
      // A guide is only shown when the piece is really on it.
      d.hitX = d.hitX.filter(x => [l, l + w / 2, r].some(v => Math.abs(v - x) < 0.6));
      d.hitY = d.hitY.filter(y => [t, t + h / 2, b].some(v => Math.abs(v - y) < 0.6));
    } else {
      // Resizing: the edge being held follows the pointer, and the other edges stay where they were.
      if (dir.includes("e")) {
        r = p.x - d.grabX;
        if (snap) r += snapTo([r], d.xs, d.hitX, true);
        r = r >= bw - SNAP / k ? bw : Math.min(r, farthestRight(l, bw));
        r = Math.max(l + MIN_W, Math.min(bw, r));
      }
      if (dir.includes("w")) {
        l = p.x - d.grabX;
        if (snap) l += snapTo([l], d.xs, d.hitX, true);
        l = r >= bw - 0.5 ? Math.max(0, l) : Math.max(farthestLeft(r, bw), l);
        l = Math.min(r - MIN_W, Math.max(0, l));
      }
      if (dir.includes("s")) {
        b = p.y - d.grabY;
        if (snap) b += snapTo([b], d.ys, d.hitY, true);
        b = Math.max(t + MIN_H, Math.min(MAX_Y, b));
      }
      if (dir.includes("n")) {
        t = p.y - d.grabY;
        if (snap) t += snapTo([t], d.ys, d.hitY, true);
        t = Math.min(b - MIN_H, Math.max(0, t));
      }
      d.vertical = d.vertical || dir.includes("n") || dir.includes("s");
      d.hitX = d.hitX.filter(x => Math.abs((dir.includes("e") ? r : l) - x) < 0.6);
      d.hitY = d.hitY.filter(y => Math.abs((dir.includes("s") ? b : t) - y) < 0.6);
    }
    d.l = l; d.t = t; d.r = r; d.b = b;
    paint(d);
  };

  const queue = (): void => { if (!raf) raf = requestAnimationFrame(step); };

  const finish = (cancel: boolean): void => {
    const d = drag;
    drag = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKey, true);
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (!d) return;
    d.guides?.remove();
    d.read?.remove();
    canvas.classList.remove("is-moving");
    d.card.classList.remove("dragging");
    try { d.card.releasePointerCapture(d.pointer); } catch { /* it was not captured */ }
    if (!d.started) { if (!cancel && !d.dir) host.tap(d.tapId); return; }
    // The click that follows a drag must not select or deselect anything.
    const eat = (e: Event): void => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener("click", eat, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", eat, true), 60);
    const bw = host.width();
    const box = d.box;
    if (cancel || (Math.abs(d.l - d.l0) < 0.5 && Math.abs(d.t - d.t0) < 0.5 && Math.abs(d.r - d.r0) < 0.5 && Math.abs(d.b - d.b0) < 0.5)) {
      host.commit(box, false);
      return;
    }
    const resized = Math.abs(d.r - d.r0) > 0.5 || Math.abs(d.l - d.l0) > 0.5;
    const placed = toModel(d.l, d.r, bw, !resized);
    box.x = placed.x;
    box.anc = placed.anc;
    if (resized) box.w = placed.w;
    box.y = Math.max(0, Math.round(d.t));
    if (d.vertical) { box.fixedH = true; box.h = Math.max(MIN_H, Math.round(d.b - d.t)); }
    host.commit(box, true);
  };

  const onMove = (e: PointerEvent): void => {
    const d = drag;
    if (!d || e.pointerId !== d.pointer) return;
    d.cx = e.clientX;
    d.cy = e.clientY;
    d.free = e.altKey;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < START) return;
      d.started = true;
      ensureLayers(d);
    }
    queue();
  };
  const onUp = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.pointer) return;
    // The last position counts, even if no frame has been drawn since the pointer moved.
    if (drag.started) { drag.cx = e.clientX; drag.cy = e.clientY; if (raf) cancelAnimationFrame(raf); step(); }
    finish(false);
  };
  const onCancel = (e: PointerEvent): void => { if (drag && e.pointerId === drag.pointer) finish(true); };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== "Escape" || !drag) return;
    e.stopPropagation();
    // Put the piece back where it was.
    const d = drag;
    d.l = d.l0; d.t = d.t0; d.r = d.r0; d.b = d.b0;
    if (d.started) paint(d);
    finish(true);
  };

  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || drag) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target || target.closest("input, textarea, select")) return;
    const handle = target.closest<HTMLElement>("[data-h]");
    const card = handle ? host.cardOf(handle.closest<HTMLElement>("[data-for]")?.dataset.for ?? "") : topCard(target);
    if (!card) return;
    const id = card.dataset.widget ?? "";
    const box = host.boxes().find(b => b.id === id);
    if (!box) return;
    const dir = (handle?.dataset.h as Dir | undefined) ?? null;
    const p = toBoard(e.clientX, e.clientY);
    const l0 = card.offsetLeft;
    const t0 = card.offsetTop;
    const r0 = l0 + card.offsetWidth;
    const b0 = t0 + card.offsetHeight;
    // How far the pointer is from the edge it holds, so the piece does not jump when it is picked up.
    const grabX = dir ? (dir.includes("e") ? p.x - r0 + 0 : dir.includes("w") ? p.x - l0 : 0) : p.x - l0;
    const grabY = dir ? (dir.includes("s") ? p.y - b0 : dir.includes("n") ? p.y - t0 : 0) : p.y - t0;
    const { xs, ys } = lines(card);
    drag = {
      id, tapId: target.closest<HTMLElement>(".fbox")?.dataset.widget ?? id, card, box, dir, pointer: e.pointerId, sx: e.clientX, sy: e.clientY, started: false,
      grabX, grabY, l0, t0, r0, b0, xs, ys, cx: e.clientX, cy: e.clientY, free: e.altKey,
      l: l0, t: t0, r: r0, b: b0, guides: null, read: null, vertical: false, hitX: [], hitY: [],
    };
    card.focus({ preventScroll: true });
    try { card.setPointerCapture(e.pointerId); } catch { /* the window listeners still hear it */ }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    e.preventDefault();
  };
  const noNative = (e: Event): void => e.preventDefault();

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("dragstart", noNative);
  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("dragstart", noNative);
    if (drag) finish(true);
  };
}
