import { BOARD_H, BOARD_W, defaultBoard, PAGE_WIDGETS } from "../../../shared/constants";
import type { BoardBox, RenderModel } from "../../../shared/types";
import { widgetHTML } from "../../render/free";
import { applyTheme } from "../../render/theme";
import { store } from "../../state";
import { GRID, makeMover, makeResizer } from "../../ui/drag";
import { toast } from "../../ui/toast";
import { delegate, esc, must } from "../../util/dom";
import type { Pane } from "./fields";

/** The grip you hold to move a piece. */
const GRIP = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`;

/** The name of a piece, for the label on it. */
const labelOf = (id: string): string => PAGE_WIDGETS.find(w => w.id === id)?.label ?? id;

/** Where a new piece can go without landing on top of another one. */
function findSpot(w: number, h: number, list: readonly BoardBox[]): { x: number; y: number } {
  const step = GRID * 4;
  for (let y = step; y + h <= BOARD_H; y += step) {
    for (let x = step; x + w <= BOARD_W; x += step) {
      const clash = list.some(b =>
        x < b.x + b.w + 16 && x + w + 16 > b.x
        && y < b.y + b.h + 16 && y + h + 16 > b.y);
      if (!clash) return { x, y };
    }
  }
  return { x: step, y: step };
}

/**
 * The board of the public page.
 *
 * Unlike the experimental board in the dashboard, this one is part of the profile, so it is
 * the board your visitors get. Each piece is drawn exactly as it appears on the page, so what
 * you move here is what they see.
 */
export const pageboardPane: Pane = {
  id: "pageboard",
  label: "Page board",
  hint: "Where the pieces of your page sit when it is in the experimental layout. This board is the one your visitors see.",
  wide: true,
  mount(el) {
    el.innerHTML = `<div class="pboard-wrap">
      <div class="pboard-bar">
        <div class="pboard-chips" role="group" aria-label="Pieces of the page"></div>
        <button class="btn-ghost" type="button" data-pb-reset>Put it back</button>
      </div>
      <p class="note pboard-note" data-pb-note></p>
      <div class="pboard-canvas stage is-free" id="pb-canvas"></div>
    </div>`;

    const canvas = must<HTMLElement>("#pb-canvas", el);
    const chips = must<HTMLElement>(".pboard-chips", el);
    const note = must<HTMLElement>("[data-pb-note]", el);
    const cleanups: Array<() => void> = [];

    /** The boxes on the board. The profile keeps them, so they are the ones visitors get. */
    const boxes = (): BoardBox[] => {
      const p = store.profile;
      if (!p.page.board.length) p.page.board = defaultBoard();
      return p.page.board;
    };

    /** Put one piece on the board. */
    const place = (box: BoardBox, model: RenderModel | null): void => {
      const card = document.createElement("div");
      card.className = "fbox";
      card.dataset.widget = box.id;
      card.tabIndex = 0;
      card.setAttribute("aria-label", `${labelOf(box.id)}. Use the arrow keys to move it.`);
      card.style.left = `${box.x}px`;
      card.style.top = `${box.y}px`;
      card.style.width = `${box.w}px`;
      card.style.height = `${box.h}px`;
      const body = model ? widgetHTML(box.id, model) : "";
      card.innerHTML = `${body}<span class="pbgrip" data-move-handle aria-hidden="true">${GRIP}</span><span class="pbtag">${esc(labelOf(box.id))}</span><span class="wresize" data-resize-handle aria-hidden="true"></span>`;
      canvas.append(card);

      cleanups.push(makeMover(card, canvas, () => {
        box.x = card.offsetLeft;
        box.y = card.offsetTop;
        store.profileChanged();
      }));
      cleanups.push(makeResizer(card, () => {
        box.w = Math.max(60, card.offsetWidth);
        box.h = Math.max(40, card.offsetHeight);
        store.profileChanged();
      }));

      // The arrow keys move a piece too, so this is not mouse-only.
      card.addEventListener("keydown", e => {
        const step = e.shiftKey ? GRID * 4 : GRID;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (!dx && !dy) return;
        e.preventDefault();
        const x = Math.max(0, card.offsetLeft + dx);
        const y = Math.max(0, card.offsetTop + dy);
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
        box.x = x;
        box.y = y;
        store.profileChanged();
      });
    };

    /** The buttons that add and remove pieces. */
    const drawChips = (): void => {
      const list = boxes();
      chips.innerHTML = PAGE_WIDGETS.map(w => {
        const on = list.some(b => b.id === w.id);
        return `<button class="chip${on ? " on" : ""}" type="button" data-pb-piece="${esc(w.id)}" aria-pressed="${on}">${on ? "✓" : "+"} ${esc(w.label)}</button>`;
      }).join("");
    };

    /** A word about whether this board is the one being shown. */
    const drawNote = (): void => {
      note.innerHTML = store.profile.page.layout === "experimental"
        ? "This is the board your visitors see. Drag a piece to move it, and pull the corner to make it bigger."
        : `Your page is set to <b>Regular</b>, so this board is not shown yet. <button class="btn-ghost" type="button" data-pb-experimental>Use the experimental layout</button>`;
    };

    /** Draw everything. */
    const draw = (): void => {
      for (const fn of cleanups.splice(0)) fn();
      canvas.innerHTML = "";
      const model = store.model;
      if (model) applyTheme(canvas, model);
      for (const box of boxes()) place(box, model);
      drawChips();
      drawNote();
    };
    draw();

    /* Redrawing waits for the current pointer work to finish, so a drag is never interrupted. */
    let timer = 0;
    const redraw = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(draw, 0);
    };
    const off = store.subscribe(redraw);

    const offs = [
      delegate(el, "click", "[data-pb-piece]", (_e, t) => {
        const id = t.dataset.pbPiece ?? "";
        const list = boxes();
        const i = list.findIndex(b => b.id === id);
        if (i >= 0) {
          if (list.length <= 1) { toast("Keep at least one piece on your page."); return; }
          list.splice(i, 1);
        } else {
          const piece = PAGE_WIDGETS.find(w => w.id === id);
          if (!piece) return;
          const spot = findSpot(piece.w, piece.h, list);
          list.push({ id, x: spot.x, y: spot.y, w: piece.w, h: piece.h });
        }
        store.profileChanged();
        draw();
      }),
      delegate(el, "click", "[data-pb-reset]", () => {
        store.profile.page.board = defaultBoard();
        store.profileChanged();
        draw();
      }),
      delegate(el, "click", "[data-pb-experimental]", () => {
        store.profile.page.layout = "experimental";
        store.profileChanged();
        draw();
      }),
    ];

    return () => {
      window.clearTimeout(timer);
      off();
      offs.forEach(fn => fn());
      for (const fn of cleanups.splice(0)) fn();
    };
  },
};
