import { BOARD_H, BOARD_W, BOX_ALIGNS, BOX_FILLS, defaultBoard, PAGE_WIDGETS } from "../../../shared/constants";
import type { BoardBox, BoxAlign, BoxFill, RenderModel } from "../../../shared/types";
import { applyBoxLook, boardHeight, boardScale, boxInner, widgetHTML } from "../../render/free";
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

const ALIGN_LABELS: Record<BoxAlign, string> = { center: "Centre", left: "Left" };
const FILL_LABELS: Record<BoxFill, string> = { soft: "Soft", solid: "Solid", outline: "Outline", glass: "Glass", none: "None" };

/** The room inside a piece, when the owner has not said otherwise. */
const DEFAULT_PAD = 16;
/** How much room is kept below the lowest piece, so there is always somewhere to drag one. */
const SLACK = 160;
/** The options sit this wide beside the board, when the pane is wide enough. */
const SIDE = 300;
const GAP = 20;
/** The farthest down a piece can be put. */
const MAX_Y = 4000;

/**
 * The board of the public page.
 *
 * It is the same board your visitors get, drawn by the same code, so what you see here is what
 * they see. A piece is as tall as what is in it; drag it by its grip to move it, pull its corner
 * to make it wider (or taller, which fixes its height), and click it to change how it looks.
 */
export const pageboardPane: Pane = {
  id: "pageboard",
  label: "Page board",
  hint: "Place the pieces of your page anywhere, in the experimental layout. This is the board your visitors see.",
  vip: true,
  wide: true,
  mount(el) {
    el.innerHTML = `<div class="pboard-wrap">
      <div class="pboard-bar">
        <div class="pboard-chips" role="group" aria-label="Pieces of the page"></div>
        <span class="pboard-zoom" data-pb-zoom></span>
        <button class="btn-ghost" type="button" data-pb-reset>Put it back</button>
      </div>
      <p class="note pboard-note" data-pb-note></p>
      <div class="pboard-main" data-pb-main>
        <div class="pboard-scale" data-pb-scale>
          <div class="pboard-canvas stage is-free" id="pb-canvas"></div>
        </div>
        <aside class="pboard-opts" data-pb-opts aria-live="polite"></aside>
      </div>
    </div>`;

    const canvas = must<HTMLElement>("#pb-canvas", el);
    const scaleBox = must<HTMLElement>("[data-pb-scale]", el);
    const zoom = must<HTMLElement>("[data-pb-zoom]", el);
    const chips = must<HTMLElement>(".pboard-chips", el);
    const note = must<HTMLElement>("[data-pb-note]", el);
    const opts = must<HTMLElement>("[data-pb-opts]", el);
    const main = must<HTMLElement>("[data-pb-main]", el);
    const cleanups: Array<() => void> = [];

    /** The piece whose options are open, if any. */
    let selected: string | null = null;
    /** When a drag or a resize last finished, so the click that ends it is not taken as a pick. */
    let dragEnded = 0;
    /** How big the board is drawn: as wide as the pane allows. */
    let scale = 1;

    /** The boxes on the board. The profile keeps them, so they are the ones visitors get. */
    const boxes = (): BoardBox[] => {
      const p = store.profile;
      if (!p.page.board.length) p.page.board = defaultBoard();
      return p.page.board;
    };
    const picked = (): BoardBox | undefined => (selected ? boxes().find(b => b.id === selected) : undefined);
    const cardOf = (id: string): HTMLElement | null => canvas.querySelector<HTMLElement>(`.fbox[data-widget="${id}"]`);

    /** The board is as tall as its lowest piece, plus room to drag one lower. */
    const grow = (): void => {
      const h = boardHeight(canvas, BOARD_H) + SLACK;
      canvas.style.height = `${h}px`;
      scaleBox.style.height = `${Math.round(h * scale)}px`;
    };

    /** Draw the board as wide as the pane allows. The options keep their room beside it, so picking a piece never changes its size. */
    const fit = (): void => {
      const room = el.clientWidth - 44;
      const beside = room >= 940;
      main.classList.toggle("beside", beside);
      scale = boardScale(beside ? room - SIDE - GAP : room);
      canvas.style.transform = `scale(${scale})`;
      canvas.style.setProperty("--inv", String(Math.min(2.2, 1 / scale)));
      scaleBox.style.width = `${Math.round(BOARD_W * scale)}px`;
      zoom.textContent = `${Math.round(scale * 100)}%`;
      grow();
    };

    /** Where a new piece can go without landing on another one. */
    const findSpot = (w: number, h: number): { x: number; y: number } => {
      const rects = boxes().map(b => {
        const c = cardOf(b.id);
        return { x: b.x, y: b.y, w: b.w, h: c ? c.offsetHeight : b.h };
      });
      const step = GRID * 5;
      for (let y = step; y < MAX_Y; y += step) {
        for (let x = step; x + w <= BOARD_W; x += step) {
          const clash = rects.some(r => x < r.x + r.w + 16 && x + w + 16 > r.x && y < r.y + r.h + 16 && y + h + 16 > r.y);
          if (!clash) return { x, y };
        }
      }
      return { x: step, y: step };
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
      applyBoxLook(card, box);
      if (box.fixedH) card.style.height = `${box.h}px`;
      if (box.id === selected) card.classList.add("sel");
      const body = model ? widgetHTML(box.id, model) : "";
      card.innerHTML = `${boxInner(body)}<span class="pbgrip" data-move-handle aria-hidden="true">${GRIP}</span><span class="pbtag">${esc(labelOf(box.id))}</span><span class="wresize" data-resize-handle aria-hidden="true"></span>`;
      canvas.append(card);

      cleanups.push(makeMover(card, canvas, () => {
        if (card.offsetLeft === box.x && card.offsetTop === box.y) return;
        dragEnded = performance.now();
        box.x = card.offsetLeft;
        box.y = card.offsetTop;
        store.profileChanged();
      }, () => scale, grow, () => ({ w: BOARD_W, h: MAX_Y })));

      // Pulling the corner makes the piece wider. If the height was pulled too, the piece keeps that height.
      let startH = 0;
      const grip = card.querySelector<HTMLElement>("[data-resize-handle]");
      grip?.addEventListener("pointerdown", () => { startH = card.offsetHeight; }, true);
      cleanups.push(makeResizer(card, () => {
        const dragged = card.offsetHeight;
        const width = Math.max(60, card.offsetWidth);
        const heightMoved = Math.abs(dragged - startH) > 6;
        if (width === box.w && !heightMoved) { card.style.height = box.fixedH ? `${box.h}px` : ""; return; }
        dragEnded = performance.now();
        box.w = width;
        if (heightMoved) { box.fixedH = true; box.h = Math.max(40, dragged); }
        card.style.height = box.fixedH ? `${box.h}px` : "";
        store.profileChanged();
      }, () => scale, grow, () => ({ w: BOARD_W - card.offsetLeft, h: 3000 })));

      // The arrow keys move a piece too, so this is not mouse-only.
      card.addEventListener("keydown", e => {
        const step = e.shiftKey ? GRID * 4 : GRID;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (!dx && !dy) return;
        e.preventDefault();
        const x = Math.max(0, Math.min(BOARD_W - card.offsetWidth, card.offsetLeft + dx));
        const y = Math.max(0, Math.min(MAX_Y, card.offsetTop + dy));
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
        box.x = x;
        box.y = y;
        grow();
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
        ? "This is the board your visitors see. Drag a piece by its grip to move it, pull its corner to resize it, and click it to change how it looks. On a phone the pieces are stacked in a column."
        : `Your page is set to <b>Regular</b>, so this board is not shown yet. <button class="btn-ghost" type="button" data-pb-experimental>Use the experimental layout</button>`;
    };

    /** The options of the piece that is picked. */
    const drawOpts = (): void => {
      const box = picked();
      if (!box) {
        opts.innerHTML = `<div class="pboard-opts-in pboard-opts-empty"><b>Pieces</b><p class="note">Click a piece on the board to change how it looks: alignment, fill, height, inside space and corners. Drag a piece by its grip to move it, and pull its corner to resize it.</p></div>`;
        return;
      }
      const p = store.profile;
      // A piece with no setting of its own follows the page.
      const align = box.align ?? (p.card.align === "left" ? "left" : "center");
      const fill = box.fill ?? (p.card.style as BoxFill);
      const pad = box.pad ?? DEFAULT_PAD;
      const radius = box.radius ?? p.card.radius;
      const seg = (name: string, value: string, label: string, on: boolean): string =>
        `<button type="button" class="seg-btn" data-pb-${name}="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;

      opts.innerHTML = `<div class="pboard-opts-in">
        <div class="pboard-opts-head">
          <span class="pboard-opts-name">${esc(labelOf(box.id))}</span>
          <button class="btn-ghost" type="button" data-pb-match>Match the page</button>
          <button class="btn-ghost" type="button" data-pb-close>Done</button>
        </div>
        <div class="pboard-opts-grid">
          <div class="pboard-opt">
            <span>Alignment</span>
            <div class="seg" role="group" aria-label="Alignment">${BOX_ALIGNS.map(a => seg("align", a, ALIGN_LABELS[a], a === align)).join("")}</div>
          </div>
          <div class="pboard-opt">
            <span>Fill</span>
            <div class="seg" role="group" aria-label="Fill">${BOX_FILLS.map(f => seg("fill", f, FILL_LABELS[f], f === fill)).join("")}</div>
          </div>
          <div class="pboard-opt">
            <span>Height</span>
            <div class="seg" role="group" aria-label="Height">${seg("height", "auto", "Fit the content", !box.fixedH)}${seg("height", "fixed", "Fixed", Boolean(box.fixedH))}</div>
          </div>
          ${box.fixedH ? `<label class="pboard-opt">
            <span>Piece height <em data-pb-h-val>${box.h}px</em></span>
            <input type="range" data-pb-h min="40" max="1200" step="8" value="${Math.min(1200, box.h)}">
          </label>` : ""}
          <label class="pboard-opt">
            <span>Inside space <em data-pb-pad-val>${pad}px</em></span>
            <input type="range" data-pb-pad min="0" max="48" step="1" value="${pad}">
          </label>
          <label class="pboard-opt">
            <span>Corners <em data-pb-radius-val>${radius}px</em></span>
            <input type="range" data-pb-radius min="0" max="48" step="1" value="${radius}">
          </label>
        </div>
        <p class="note">What is inside a piece is never shrunk: it is laid out at its own size, the same as on the usual page. "Fit the content" makes the piece as tall as what is in it.</p>
      </div>`;
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
      drawOpts();
      fit();
    };
    draw();

    // The pane changes size, and pieces change height as their content settles (fonts, pictures).
    let resize: ResizeObserver | null = null;
    let inner: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resize = new ResizeObserver(fit);
      resize.observe(el);
      inner = new ResizeObserver(grow);
    }
    const watch = (): void => {
      inner?.disconnect();
      for (const c of canvas.querySelectorAll(".fbox-in")) inner?.observe(c);
    };
    watch();

    /*
     * Redrawing waits for the current pointer work to finish, so a drag is never interrupted.
     * It also ignores the store telling us a save finished: that changes nothing on the board,
     * and redrawing then would throw away a piece that is being dragged.
     */
    let timer = 0;
    let holding = false;
    let late = false;
    const redraw = (): void => {
      if (holding) { late = true; return; }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { draw(); watch(); }, 0);
    };
    const hold = (): void => { holding = true; };
    const release = (): void => {
      holding = false;
      if (late) { late = false; redraw(); }
    };
    canvas.addEventListener("pointerdown", hold, true);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    let lastSave = store.saveState;
    const off = store.subscribe(() => {
      if (store.saveState !== lastSave) { lastSave = store.saveState; return; }
      redraw();
    });

    /** Change a piece and show it at once, without waiting for the page to be drawn again. */
    const change = (box: BoardBox, patch: Partial<BoardBox>): void => {
      Object.assign(box, patch);
      const card = cardOf(box.id);
      if (!card) return;
      applyBoxLook(card, box);
      card.style.height = box.fixedH ? `${box.h}px` : "";
      grow();
    };
    const commit = (): void => { store.profileChanged(); };
    const pick = (id: string | null): void => {
      selected = id;
      for (const card of canvas.querySelectorAll<HTMLElement>(".fbox")) card.classList.toggle("sel", card.dataset.widget === selected);
      drawOpts();
    };

    const offs = [
      delegate(el, "click", "[data-pb-piece]", (_e, t) => {
        const id = t.dataset.pbPiece ?? "";
        const list = boxes();
        const i = list.findIndex(b => b.id === id);
        if (i >= 0) {
          if (list.length <= 1) { toast("Keep at least one piece on your page."); return; }
          list.splice(i, 1);
          if (selected === id) selected = null;
        } else {
          const piece = PAGE_WIDGETS.find(w => w.id === id);
          if (!piece) return;
          const spot = findSpot(piece.w, piece.h);
          list.push({ id, x: spot.x, y: spot.y, w: piece.w, h: piece.h });
        }
        commit();
        draw();
        watch();
      }),
      delegate(el, "click", "[data-pb-reset]", () => {
        store.profile.page.board = defaultBoard();
        selected = null;
        commit();
        draw();
        watch();
      }),
      delegate(el, "click", "[data-pb-experimental]", () => {
        store.profile.page.layout = "experimental";
        commit();
        draw();
      }),

      // Clicking a piece opens its options.
      delegate(el, "click", ".pboard-canvas .fbox", (e, t) => {
        e.preventDefault();
        if (performance.now() - dragEnded < 300) return;
        const id = t.dataset.widget ?? "";
        if (id) pick(selected === id ? null : id);
      }),
      delegate(el, "click", "[data-pb-close]", () => pick(null)),
      // The piece goes back to the look of the page.
      delegate(el, "click", "[data-pb-match]", () => {
        const box = picked();
        if (!box) return;
        delete box.align;
        delete box.fill;
        delete box.fit;
        delete box.pad;
        delete box.radius;
        delete box.fixedH;
        change(box, {});
        commit();
        drawOpts();
      }),
      delegate(el, "click", "[data-pb-align]", (_e, t) => {
        const box = picked();
        const value = t.dataset.pbAlign;
        if (!box || !value || !BOX_ALIGNS.includes(value as BoxAlign)) return;
        change(box, { align: value as BoxAlign });
        commit();
        drawOpts();
      }),
      delegate(el, "click", "[data-pb-fill]", (_e, t) => {
        const box = picked();
        const value = t.dataset.pbFill;
        if (!box || !value || !BOX_FILLS.includes(value as BoxFill)) return;
        change(box, { fill: value as BoxFill });
        commit();
        drawOpts();
      }),
      delegate(el, "click", "[data-pb-height]", (_e, t) => {
        const box = picked();
        if (!box) return;
        if (t.dataset.pbHeight === "fixed") {
          const card = cardOf(box.id);
          change(box, { fixedH: true, h: Math.max(40, card ? card.offsetHeight : box.h) });
        } else {
          delete box.fixedH;
          change(box, {});
        }
        commit();
        drawOpts();
      }),

      // The sliders show the change at once, and are saved when the drag ends.
      delegate(el, "input", "[data-pb-h]", (_e, t) => {
        const box = picked();
        const input = t as HTMLInputElement;
        if (!box) return;
        change(box, { h: Number(input.value) });
        const readout = opts.querySelector<HTMLElement>("[data-pb-h-val]");
        if (readout) readout.textContent = `${input.value}px`;
      }),
      delegate(el, "change", "[data-pb-h]", commit),
      delegate(el, "input", "[data-pb-pad]", (_e, t) => {
        const box = picked();
        const input = t as HTMLInputElement;
        if (!box) return;
        change(box, { pad: Number(input.value) });
        const readout = opts.querySelector<HTMLElement>("[data-pb-pad-val]");
        if (readout) readout.textContent = `${input.value}px`;
      }),
      delegate(el, "change", "[data-pb-pad]", commit),
      delegate(el, "input", "[data-pb-radius]", (_e, t) => {
        const box = picked();
        const input = t as HTMLInputElement;
        if (!box) return;
        change(box, { radius: Number(input.value) });
        const readout = opts.querySelector<HTMLElement>("[data-pb-radius-val]");
        if (readout) readout.textContent = `${input.value}px`;
      }),
      delegate(el, "change", "[data-pb-radius]", commit),
    ];

    return () => {
      window.clearTimeout(timer);
      resize?.disconnect();
      inner?.disconnect();
      canvas.removeEventListener("pointerdown", hold, true);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      off();
      offs.forEach(fn => fn());
      for (const fn of cleanups.splice(0)) fn();
    };
  },
};
