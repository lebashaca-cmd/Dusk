import { BOARD_H, BOARD_W, BOX_ALIGNS, BOX_FILLS, defaultBoard, kindOf, MAX_PIECES, PAGE_KINDS, PAGE_WIDGETS } from "../../../shared/constants";
import type { BoardBox, BoxAlign, BoxFill, RenderModel } from "../../../shared/types";
import { applyBoxLook, boardHeight, boardScale, boxInner, layerOf, pieceLabel, widgetHTML } from "../../render/free";
import { applyTheme } from "../../render/theme";
import { store } from "../../state";
import { GRID, makeMover, makeResizer } from "../../ui/drag";
import { toast } from "../../ui/toast";
import { delegate, esc, must } from "../../util/dom";
import type { Pane } from "./fields";

/** The grip you hold to move a piece. */
const GRIP = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`;

/** Pieces you can have more than one of. */
const MULTI = new Set<string>(PAGE_KINDS.map(k => k.kind));

const ALIGN_LABELS: Record<BoxAlign, string> = { center: "Centre", left: "Left" };
const FILL_LABELS: Record<BoxFill, string> = { soft: "Soft", solid: "Solid", outline: "Outline", glass: "Glass", none: "None" };

/** Which setting each slider changes. */
const SLIDER_KEYS: Record<string, keyof BoardBox> = { sz: "size", h: "h", pad: "pad", radius: "radius", op: "opacity", bl: "blur", bd: "borderW", sh: "shadow" };

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
      card.dataset.kind = kindOf(box.id);
      card.setAttribute("aria-label", `${pieceLabel(box)}. Use the arrow keys to move it.`);
      card.style.left = `${box.x}px`;
      card.style.top = `${box.y}px`;
      card.style.width = `${box.w}px`;
      applyBoxLook(card, box);
      if (box.fixedH) card.style.height = `${box.h}px`;
      if (box.id === selected) card.classList.add("sel");
      const body = model ? widgetHTML(box.id, model, box) : "";
      card.innerHTML = `${boxInner(body)}<span class="pbgrip" data-move-handle aria-hidden="true">${GRIP}</span><span class="pbtag">${esc(pieceLabel(box))}</span><span class="wresize" data-resize-handle aria-hidden="true"></span>`;
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
        const width = Math.max(20, card.offsetWidth);
        const heightMoved = Math.abs(dragged - startH) > 6;
        if (width === box.w && !heightMoved) { card.style.height = box.fixedH ? `${box.h}px` : ""; return; }
        dragEnded = performance.now();
        box.w = width;
        if (heightMoved) { box.fixedH = true; box.h = Math.max(16, dragged); }
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

    /** The buttons that add and remove pieces, and the ones that add another page or button. */
    const drawChips = (): void => {
      const list = boxes();
      const usual = PAGE_WIDGETS.map(w => {
        const on = list.some(b => b.id === w.id);
        return `<button class="chip${on ? " on" : ""}" type="button" data-pb-piece="${esc(w.id)}" aria-pressed="${on}">${on ? "✓" : "+"} ${esc(w.label)}</button>`;
      }).join("");
      const more = PAGE_KINDS.map(k => `<button class="chip chip-add" type="button" data-pb-add="${k.kind}">+ ${esc(k.label)}</button>`).join("");
      chips.innerHTML = `${usual}<span class="pboard-sep" aria-hidden="true"></span>${more}`;
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
        opts.innerHTML = `<div class="pboard-opts-in pboard-opts-empty"><b>Pieces</b><p class="note">Click a piece on the board to change how it looks: its place, fill, see-through, blur, border, shadow, layer, inside space and corners. Drag a piece by its grip to move it, and pull its corner to resize it.</p><p class="note"><b>Page</b> adds another screen to your page. <b>Button</b> adds a button that scrolls to one.</p></div>`;
        return;
      }
      const p = store.profile;
      const kind = kindOf(box.id);
      // A piece with no setting of its own follows the page.
      const align = box.align ?? (p.card.align === "left" ? "left" : "center");
      const fill = box.fill ?? (p.card.style as BoxFill);
      const pad = box.pad ?? DEFAULT_PAD;
      const radius = box.radius ?? p.card.radius;
      const layer = layerOf(box);
      const seg = (name: string, value: string, label: string, on: boolean): string =>
        `<button type="button" class="seg-btn" data-pb-${name}="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
      const act = (name: string, label: string): string =>
        `<button type="button" class="seg-btn" data-pb-${name}>${esc(label)}</button>`;
      const slider = (name: string, label: string, value: number, min: number, max: number, unit: string, step = 1): string =>
        `<label class="pboard-opt"><span>${esc(label)} <em data-pb-${name}-val>${value}${unit}</em></span><input type="range" data-pb-range data-key="${name}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
      const pages = boxes().filter(b => kindOf(b.id) === "page");
      const target = box.target ?? "top";

      const textIn = (name: string, label: string, value: string, ph: string, max = 60): string =>
        `<label class="pboard-opt"><span>${esc(label)}</span><input type="text" class="pboard-text" data-pb-${name} maxlength="${max}" placeholder="${esc(ph)}" value="${esc(value)}"></label>`;
      const colorIn = `<div class="pboard-opt"><span>Colour</span><div class="pboard-colorrow"><input type="color" data-pb-color value="${esc(box.color ?? "#ffffff")}" aria-label="Colour"><button type="button" class="seg-btn" data-pb-color-clear>Use the page colour</button></div></div>`;
      const targets = `<label class="pboard-opt"><span>Scrolls to</span><select class="pboard-text" data-pb-target>
               <option value="top"${target === "top" ? " selected" : ""}>The top of the page</option>
               ${pages.map(pg => `<option value="${esc(pg.id)}"${target === pg.id ? " selected" : ""}>${esc(pieceLabel(pg))}</option>`).join("")}
             </select></label>`;
      let words = "";
      if (kind === "page") {
        words = `${textIn("label", "Title of this page", box.label ?? "", "No title")}${colorIn}
           <p class="note">A page is a panel of your board. Put pieces on top of it, then add a Button or a Scroll rail to move between pages.</p>`;
      } else if (kind === "jump") {
        words = `${textIn("label", "Button text", box.label ?? "", "Scroll down")}${targets}${colorIn}`;
      } else if (kind === "rail") {
        const dock = box.dock ?? "here";
        words = `<div class="pboard-opt"><span>Where it sits</span><div class="seg" role="group" aria-label="Where it sits">${seg("dock", "right", "Right of the screen", dock === "right")}${seg("dock", "left", "Left of the screen", dock === "left")}${seg("dock", "here", "Here on the board", dock === "here")}</div></div>
           <div class="pboard-opt"><span>Marks</span><div class="seg" role="group" aria-label="Marks">${seg("look", "bar", "Bars", box.look !== "dot")}${seg("look", "dot", "Dots", box.look === "dot")}</div></div>
           ${slider("sz", "Thickness", box.size ?? 3, 1, 12, "px")}${colorIn}
           <p class="note">The rail has one mark for the top and one for each page. The page you are on is shown long. On the screen it stays in place as you scroll.</p>`;
      } else if (kind === "text") {
        words = `${textIn("label", "Heading", box.label ?? "", "No heading")}
           <label class="pboard-opt"><span>Text</span><textarea class="pboard-text" data-pb-text maxlength="600" placeholder="Write something">${esc(box.text ?? "")}</textarea></label>${colorIn}`;
      } else if (kind === "image") {
        words = `${textIn("url", "Image address", box.url ?? "", "https://…", 500)}${textIn("label", "Describe it (for screen readers)", box.label ?? "", "A short description")}
           <div class="pboard-opt"><span>Fills the piece</span><div class="seg" role="group" aria-label="Fills the piece">${seg("look", "cover", "Cover", box.look !== "contain")}${seg("look", "contain", "Fit inside", box.look === "contain")}</div></div>`;
      } else if (kind === "divider") {
        words = `${slider("sz", "Thickness", box.size ?? 2, 1, 12, "px")}${colorIn}`;
      }

      opts.innerHTML = `<div class="pboard-opts-in">
        <div class="pboard-opts-head">
          <span class="pboard-opts-name">${esc(pieceLabel(box))}</span>
          <button class="btn-ghost" type="button" data-pb-match>Reset look</button>
          <button class="btn-ghost" type="button" data-pb-close>Done</button>
        </div>
        ${words}
        <div class="pboard-opts-grid">
          <div class="pboard-opt">
            <span>Place on the board</span>
            <div class="seg" role="group" aria-label="Place on the board">${act("at-left", "Left edge")}${act("at-center", "Centre")}${act("at-right", "Right edge")}${act("at-top", "Top edge")}${act("at-full", "Full width")}</div>
          </div>
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
          ${box.fixedH ? slider("h", "Piece height", Math.min(1600, box.h), 16, 1600, "px", 8) : ""}
          <div class="pboard-opt">
            <span>Layer <em>${layer}</em></span>
            <div class="seg" role="group" aria-label="Layer">${act("back", "Send back")}${act("forward", "Bring forward")}</div>
          </div>
          ${slider("op", "See-through", box.opacity ?? 100, 20, 100, "%")}
          ${slider("bl", "Blur behind", box.blur ?? 0, 0, 40, "px")}
          ${slider("bd", "Border", box.borderW ?? 1, 0, 8, "px")}
          ${slider("sh", "Shadow", box.shadow ?? 0, 0, 100, "%")}
          ${slider("pad", "Inside space", pad, 0, 48, "px")}
          ${slider("radius", "Corners", radius, 0, 48, "px")}
        </div>
        <p class="note">What is inside a piece is never shrunk: it is laid out at its own size, the same as on the usual page.</p>
        ${MULTI.has(kind) ? `<button class="btn-ghost danger" type="button" data-pb-remove>Remove this ${esc((PAGE_KINDS.find(k => k.kind === kind)?.label ?? "piece").toLowerCase())}</button>` : ""}
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

    /** Draw the inside of a piece again, after its words changed. */
    const refresh = (box: BoardBox): void => {
      const card = cardOf(box.id);
      const model = store.model;
      const inside = card?.querySelector<HTMLElement>(".fbox-in");
      if (!card || !model || !inside) return;
      inside.innerHTML = widgetHTML(box.id, model, box);
      const tag = card.querySelector<HTMLElement>(".pbtag");
      if (tag) tag.textContent = pieceLabel(box);
      const name = opts.querySelector<HTMLElement>(".pboard-opts-name");
      if (name) name.textContent = pieceLabel(box);
      grow();
    };

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
        delete box.opacity;
        delete box.blur;
        delete box.borderW;
        delete box.shadow;
        delete box.z;
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
          change(box, { fixedH: true, h: Math.max(16, card ? card.offsetHeight : box.h) });
        } else {
          delete box.fixedH;
          change(box, {});
        }
        commit();
        drawOpts();
      }),

      // The sliders show the change at once, and are saved when the drag ends.
      // The sliders show the change at once, and are saved when the drag ends.
      delegate(el, "input", "[data-pb-range]", (_e, t) => {
        const box = picked();
        const input = t as HTMLInputElement;
        const key = SLIDER_KEYS[input.dataset.key ?? ""];
        if (!box || !key) return;
        change(box, { [key]: Number(input.value) } as Partial<BoardBox>);
        const readout = opts.querySelector<HTMLElement>(`[data-pb-${input.dataset.key}-val]`);
        if (readout) readout.textContent = `${input.value}${input.dataset.unit ?? ""}`;
      }),
      delegate(el, "change", "[data-pb-range]", commit),

      // Where the piece sits on the board: right at an edge, not near it.
      delegate(el, "click", "[data-pb-at-left], [data-pb-at-center], [data-pb-at-right], [data-pb-at-top], [data-pb-at-full]", (_e, t) => {
        const box = picked();
        const card = box ? cardOf(box.id) : null;
        if (!box || !card) return;
        const d = t.dataset;
        const w = card.offsetWidth;
        if ("pbAtFull" in d) { box.x = 0; box.w = BOARD_W; card.style.width = `${BOARD_W}px`; }
        else if ("pbAtLeft" in d) box.x = 0;
        else if ("pbAtRight" in d) box.x = BOARD_W - w;
        else if ("pbAtCenter" in d) box.x = Math.round((BOARD_W - w) / 2);
        else if ("pbAtTop" in d) box.y = 0;
        card.style.left = `${box.x}px`;
        card.style.top = `${box.y}px`;
        grow();
        commit();
      }),
      // Which piece is in front.
      delegate(el, "click", "[data-pb-back], [data-pb-forward]", (_e, t) => {
        const box = picked();
        if (!box) return;
        const z = layerOf(box) + ("pbForward" in t.dataset ? 1 : -1);
        change(box, { z: Math.max(0, Math.min(20, z)) });
        commit();
        drawOpts();
      }),

      // The words on a page or a button, and where a button goes.
      delegate(el, "input", "[data-pb-label]", (_e, t) => {
        const box = picked();
        if (!box) return;
        box.label = (t as HTMLInputElement).value;
        refresh(box);
        if (kindOf(box.id) === "page") for (const r of boxes()) if (kindOf(r.id) === "rail") refresh(r);
      }),
      delegate(el, "change", "[data-pb-label]", () => { commit(); drawOpts(); }),
      delegate(el, "change", "[data-pb-target]", (_e, t) => {
        const box = picked();
        if (!box) return;
        box.target = (t as HTMLSelectElement).value;
        refresh(box);
        commit();
      }),

      delegate(el, "click", "[data-pb-dock]", (_e, t) => {
        const box = picked();
        const v = t.dataset.pbDock;
        if (!box || (v !== "here" && v !== "left" && v !== "right")) return;
        box.dock = v;
        commit();
        drawOpts();
        toast(v === "here" ? "The rail sits on the board." : "On your page the rail stays at the side of the screen as you scroll.");
      }),
      delegate(el, "click", "[data-pb-look]", (_e, t) => {
        const box = picked();
        const v = t.dataset.pbLook;
        if (!box || (v !== "bar" && v !== "dot" && v !== "cover" && v !== "contain")) return;
        change(box, { look: v });
        refresh(box);
        commit();
        drawOpts();
      }),
      delegate(el, "input", "[data-pb-color]", (_e, t) => {
        const box = picked();
        if (!box) return;
        change(box, { color: (t as HTMLInputElement).value });
      }),
      delegate(el, "change", "[data-pb-color]", commit),
      delegate(el, "click", "[data-pb-color-clear]", () => {
        const box = picked();
        if (!box) return;
        delete box.color;
        change(box, {});
        commit();
        drawOpts();
      }),
      delegate(el, "input", "[data-pb-text]", (_e, t) => {
        const box = picked();
        if (!box) return;
        box.text = (t as HTMLTextAreaElement).value;
        refresh(box);
      }),
      delegate(el, "change", "[data-pb-text]", commit),
      delegate(el, "input", "[data-pb-url]", (_e, t) => {
        const box = picked();
        if (!box) return;
        const v = (t as HTMLInputElement).value.trim();
        if (/^https?:\/\/\S+$/i.test(v)) box.url = v; else delete box.url;
        refresh(box);
      }),
      delegate(el, "change", "[data-pb-url]", (_e, t) => {
        const box = picked();
        const input = t as HTMLInputElement;
        const v = input.value.trim();
        // A bare address gets https:// in front, the same as the links do.
        if (box && v && !/^[a-z][a-z0-9+.-]*:/i.test(v) && !/\s/.test(v)) { box.url = `https://${v}`; input.value = box.url; refresh(box); }
        commit();
      }),

      // Another page, or another button.
      delegate(el, "click", "[data-pb-add]", (_e, t) => {
        const kind = t.dataset.pbAdd ?? "";
        const spec = PAGE_KINDS.find(k => k.kind === kind);
        const list = boxes();
        if (!spec) return;
        if (list.length >= MAX_PIECES) { toast("That is the most pieces a board can hold."); return; }
        let n = 2;
        while (list.some(b => b.id === `${kind}:${n}`)) n++;
        const id = `${kind}:${n}`;
        let box: BoardBox;
        const spot = findSpot(spec.w, spec.h);
        if (kind === "page") {
          // The next page starts below everything that is already there.
          const bottom = list.reduce((m, b) => { const c = cardOf(b.id); return Math.max(m, b.y + (c ? c.offsetHeight : b.h)); }, 0);
          const y = Math.ceil((bottom + 80) / GRID) * GRID;
          box = { id, x: 40, y, w: 1120, h: spec.h, fixedH: true, fill: "soft", label: `Page ${list.filter(b => kindOf(b.id) === "page").length + 2}` };
        } else if (kind === "jump") {
          const firstPage = list.find(b => kindOf(b.id) === "page");
          box = { id, x: spot.x, y: spot.y, w: spec.w, h: spec.h, fill: "outline", label: "Scroll down", target: firstPage?.id ?? "top" };
        } else if (kind === "rail") {
          box = { id, x: BOARD_W - spec.w - 16, y: 120, w: spec.w, h: spec.h, fill: "none", dock: "right", look: "bar" };
        } else if (kind === "text") {
          box = { id, x: spot.x, y: spot.y, w: spec.w, h: spec.h, fill: "soft", label: "A heading", text: "Write something here." };
        } else if (kind === "image") {
          box = { id, x: spot.x, y: spot.y, w: spec.w, h: spec.h, fixedH: true, fill: "none", pad: 0, look: "cover" };
        } else {
          box = { id, x: spot.x, y: spot.y, w: spec.w, h: spec.h, fill: "none", size: 2 };
        }
        list.push(box);
        selected = id;
        commit();
        draw();
        watch();
        cardOf(id)?.scrollIntoView({ block: "nearest" });
      }),
      delegate(el, "click", "[data-pb-remove]", () => {
        const box = picked();
        if (!box) return;
        const list = boxes();
        list.splice(list.indexOf(box), 1);
        // A button that went to this page goes to the top now.
        for (const b of list) if (b.target === box.id) b.target = "top";
        selected = null;
        commit();
        draw();
        watch();
      }),
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
