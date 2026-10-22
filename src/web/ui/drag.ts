/**
 * Moving things with the pointer.
 *
 * Everything here works with Pointer Events, so a mouse, a finger and a stylus all do
 * the same thing. Nothing is dragged by a mouse alone: a handle starts the drag, and
 * the keyboard can do the same job with the arrow keys.
 */

/** Everything lands on this grid, so a board looks tidy however you drag it. */
export const GRID = 8;

/** Round to the grid. */
export const snap = (n: number): number => Math.round(n / GRID) * GRID;

/**
 * Let the items in `list` be dragged into a new order.
 *
 * Only an element marked `data-sort-handle` starts a drag, so the items themselves keep
 * working as buttons. The items are marked `data-sort-item`.
 */
export function makeSortable(list: HTMLElement, onEnd: () => void): () => void {
  let dragged: HTMLElement | null = null;
  let pointer = -1;

  const down = (e: PointerEvent): void => {
    if (e.button !== 0 || dragged) return;
    const start = e.target instanceof Element ? e.target : null;
    const handle = start?.closest<HTMLElement>("[data-sort-handle]");
    if (!handle) return;
    const item = handle.closest<HTMLElement>("[data-sort-item]");
    if (!item || item.parentElement !== list) return;
    // A control inside the handle is not a handle. The item itself may be a button —
    // that is how a rail of buttons is dragged at all.
    const control = start?.closest("button");
    if (control && control !== item) return;
    dragged = item;
    pointer = e.pointerId;
    item.classList.add("dragging");
    item.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const move = (e: PointerEvent): void => {
    const item = dragged;
    if (!item || e.pointerId !== pointer) return;
    // While the item is being dragged it must not be the thing under the pointer, or
    // we would always find ourselves.
    item.style.pointerEvents = "none";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    item.style.pointerEvents = "";
    const over = under instanceof Element ? under.closest<HTMLElement>("[data-sort-item]") : null;
    if (!over || over === item || over.parentElement !== list) return;
    const r = over.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    list.insertBefore(item, after ? over.nextSibling : over);
  };

  const up = (e: PointerEvent): void => {
    const item = dragged;
    if (!item || e.pointerId !== pointer) return;
    item.releasePointerCapture?.(e.pointerId);
    item.classList.remove("dragging");
    dragged = null;
    pointer = -1;
    onEnd();
  };

  /** The keyboard can move an item too, so the order is not mouse-only. */
  const key = (e: KeyboardEvent): void => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const start = e.target instanceof Element ? e.target : null;
    const item = start?.closest<HTMLElement>("[data-sort-item]");
    if (!item || item.parentElement !== list) return;
    const other = e.key === "ArrowUp" ? item.previousElementSibling : item.nextElementSibling;
    if (!other) return;
    e.preventDefault();
    if (e.key === "ArrowUp") list.insertBefore(item, other);
    else list.insertBefore(other, item);
    item.focus();
    onEnd();
  };

  list.addEventListener("pointerdown", down);
  list.addEventListener("pointermove", move);
  list.addEventListener("pointerup", up);
  list.addEventListener("pointercancel", up);
  list.addEventListener("keydown", key);
  return () => {
    list.removeEventListener("pointerdown", down);
    list.removeEventListener("pointermove", move);
    list.removeEventListener("pointerup", up);
    list.removeEventListener("pointercancel", up);
    list.removeEventListener("keydown", key);
  };
}

/**
 * Drag a card around a board. The card is positioned by its own left and top, so the
 * board can be any size and the card can go anywhere inside it.
 */
export function makeMover(card: HTMLElement, board: HTMLElement, onEnd: () => void): () => void {
  const handle = card.querySelector<HTMLElement>("[data-move-handle]") ?? card;
  let pointer = -1;
  let startX = 0;
  let startY = 0;
  let left = 0;
  let top = 0;

  const down = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest("button")) return;
    pointer = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    left = card.offsetLeft;
    top = card.offsetTop;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const move = (e: PointerEvent): void => {
    if (e.pointerId !== pointer) return;
    const maxX = Math.max(0, board.clientWidth - card.offsetWidth);
    const maxY = Math.max(0, board.clientHeight - card.offsetHeight);
    const x = Math.max(0, Math.min(maxX, snap(left + e.clientX - startX)));
    const y = Math.max(0, Math.min(maxY, snap(top + e.clientY - startY)));
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.classList.add("dragging");
  };

  const up = (e: PointerEvent): void => {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    card.classList.remove("dragging");
    handle.releasePointerCapture?.(e.pointerId);
    onEnd();
  };

  handle.addEventListener("pointerdown", down);
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
  handle.addEventListener("pointercancel", up);
  return () => {
    handle.removeEventListener("pointerdown", down);
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
    handle.removeEventListener("pointercancel", up);
  };
}

/** Drag the corner of a card to make it bigger or smaller. */
export function makeResizer(card: HTMLElement, onEnd: () => void): () => void {
  const grip = card.querySelector<HTMLElement>("[data-resize-handle]");
  if (!grip) return () => {};
  let pointer = -1;
  let startX = 0;
  let startY = 0;
  let w = 0;
  let h = 0;

  const down = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    pointer = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    w = card.offsetWidth;
    h = card.offsetHeight;
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };

  const move = (e: PointerEvent): void => {
    if (e.pointerId !== pointer) return;
    const least = GRID * 6;
    card.style.width = `${Math.max(least, snap(w + e.clientX - startX))}px`;
    card.style.height = `${Math.max(least, snap(h + e.clientY - startY))}px`;
  };

  const up = (e: PointerEvent): void => {
    if (e.pointerId !== pointer) return;
    pointer = -1;
    grip.releasePointerCapture?.(e.pointerId);
    onEnd();
  };

  grip.addEventListener("pointerdown", down);
  grip.addEventListener("pointermove", move);
  grip.addEventListener("pointerup", up);
  grip.addEventListener("pointercancel", up);
  return () => {
    grip.removeEventListener("pointerdown", down);
    grip.removeEventListener("pointermove", move);
    grip.removeEventListener("pointerup", up);
    grip.removeEventListener("pointercancel", up);
  };
}
