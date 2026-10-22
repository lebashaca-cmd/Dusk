import { layout, saveLayout, type WidgetBox } from "../../layout";
import { Stage } from "../../render/stage";
import { store } from "../../state";
import { GRID, makeMover, makeResizer } from "../../ui/drag";
import { icon } from "../../ui/icons";
import { delegate, esc, must } from "../../util/dom";
import { discordPane } from "./discord";
import { groupsPane } from "./groups";
import { insightsPane } from "./insights";
import { linksPane } from "./links";
import { musicPane } from "./music";
import { profilePane } from "./profile";
import { sharePane } from "./share";
import type { Pane } from "./fields";

/** A thing you can put on the board. */
interface Widget {
  id: string;
  label: string;
  /** The size it starts at, in pixels. */
  w: number;
  h: number;
  /** Fill the card with something. Returns a function that tidies it up again. */
  build(body: HTMLElement): () => void;
}

/** The grip you hold to move a card. */
const GRIP = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`;

const WIDGETS: Widget[] = [
  {
    id: "preview",
    label: "Preview",
    w: 340,
    h: 540,
    build(body) {
      const model = store.model;
      if (!model) {
        body.innerHTML = `<p class="note">There is no page to show yet.</p>`;
        return () => {};
      }
      const stage = new Stage(model, { width: 300 });
      body.append(stage.el);
      const off = store.subscribe(() => {
        const m = store.model;
        if (m) stage.update(m);
      });
      return () => { off(); stage.destroy(); };
    },
  },
  { id: "profile", label: "Profile", w: 380, h: 460, build: body => profilePane.mount(body) },
  { id: "links", label: "Links", w: 380, h: 460, build: body => linksPane.mount(body) },
  { id: "groups", label: "Groups", w: 380, h: 460, build: body => groupsPane.mount(body) },
  { id: "music", label: "Music", w: 380, h: 520, build: body => musicPane.mount(body) },
  { id: "discord", label: "Discord", w: 380, h: 460, build: body => discordPane.mount(body) },
  { id: "insights", label: "Insights", w: 380, h: 380, build: body => insightsPane.mount(body) },
  { id: "share", label: "Share", w: 380, h: 460, build: body => sharePane.mount(body) },
];

/** Where a new card can go without landing on top of another one. */
function findSpot(w: number, h: number, boxes: readonly WidgetBox[]): { x: number; y: number } {
  const step = GRID * 4;
  for (let y = step; y <= 6000; y += step) {
    for (let x = step; x <= 6000; x += step) {
      const clash = boxes.some(b =>
        x < b.x + b.w + 16 && x + w + 16 > b.x
        && y < b.y + b.h + 16 && y + h + 16 > b.y);
      if (!clash) return { x, y };
    }
  }
  return { x: step, y: step };
}

/**
 * The experimental board: a free-form place to keep your tools.
 *
 * Cards can be moved anywhere, resized from the corner, and hidden. How the board is
 * set up is remembered in this browser, per person.
 */
export const boardPane: Pane = {
  id: "board",
  label: "Experimental",
  hint: "A board of your own. Drag the cards around, resize them, and make it yours.",
  wide: true,
  mount(el) {
    el.innerHTML = `<div class="board-wrap">
      <div class="board-bar">
        <div class="board-chips" role="group" aria-label="Add a card">
          ${WIDGETS.map(w => `<button class="chip" type="button" data-add-widget="${w.id}">+ ${esc(w.label)}</button>`).join("")}
        </div>
        <button class="btn-ghost" type="button" data-board-reset>Clear the board</button>
      </div>
      <div class="board-canvas" id="board-canvas"></div>
    </div>`;

    const canvas = must<HTMLElement>("#board-canvas", el);
    const boxes = layout().board;
    const cleanups: Array<() => void> = [];

    /** How wide the board has to be to hold every card. */
    const span = (): number => {
      const right = boxes.reduce((max, b) => Math.max(max, b.x + b.w), 0);
      return Math.max(canvas.clientWidth, right + 48);
    };

    /** Put one card on the board. */
    const place = (box: WidgetBox): void => {
      const widget = WIDGETS.find(w => w.id === box.id);
      if (!widget) return;

      const card = document.createElement("article");
      card.className = "wcard";
      card.dataset.widget = box.id;
      card.tabIndex = 0;
      card.setAttribute("aria-label", `${widget.label} card. Use the arrow keys to move it.`);
      card.style.left = `${box.x}px`;
      card.style.top = `${box.y}px`;
      card.style.width = `${box.w}px`;
      card.style.height = `${box.h}px`;
      card.innerHTML = `<header class="whead" data-move-handle>
          <span class="wgrip" aria-hidden="true">${GRIP}</span>
          <b>${esc(widget.label)}</b>
          <button class="icon-btn x" type="button" data-hide aria-label="Hide this card">${icon("close")}</button>
        </header>
        <div class="wbody"></div>
        <span class="wresize" data-resize-handle aria-hidden="true"></span>`;

      const body = card.querySelector<HTMLElement>(".wbody")!;
      canvas.append(card);
      cleanups.push(widget.build(body));

      cleanups.push(makeMover(card, canvas, () => {
        box.x = card.offsetLeft;
        box.y = card.offsetTop;
        saveLayout();
      }));
      cleanups.push(makeResizer(card, () => {
        box.w = card.offsetWidth;
        box.h = card.offsetHeight;
        saveLayout();
      }));

      // The arrow keys move a card too, so this is not mouse-only.
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
        saveLayout();
      });
    };

    /** Draw every card that is on the board. */
    const draw = (): void => {
      for (const fn of cleanups.splice(0)) fn();
      canvas.innerHTML = "";
      // The board grows to hold its cards, and the pane scrolls to reach them.
      canvas.style.width = `${span()}px`;
      for (const box of boxes) place(box);
    };
    draw();

    const offs = [
      delegate(el, "click", "[data-add-widget]", (_e, t) => {
        const id = t.dataset.addWidget ?? "";
        const widget = WIDGETS.find(w => w.id === id);
        if (!widget || boxes.some(b => b.id === id)) return;
        const spot = findSpot(widget.w, widget.h, boxes);
        boxes.push({ id, x: spot.x, y: spot.y, w: widget.w, h: widget.h });
        saveLayout();
        draw();
      }),
      delegate(el, "click", "[data-hide]", (_e, t) => {
        const card = t.closest<HTMLElement>("[data-widget]");
        const id = card?.dataset.widget;
        const i = boxes.findIndex(b => b.id === id);
        if (i < 0) return;
        boxes.splice(i, 1);
        saveLayout();
        draw();
      }),
      delegate(el, "click", "[data-board-reset]", () => {
        boxes.splice(0, boxes.length);
        saveLayout();
        draw();
      }),
    ];

    return () => {
      offs.forEach(fn => fn());
      for (const fn of cleanups.splice(0)) fn();
    };
  },
};
