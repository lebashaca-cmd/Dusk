import { BOARD_H, BOARD_W, BOX_ALIGNS, BOX_ANIMS, BOX_FILLS, BOX_HOVERS, BOX_LOOPS, defaultBoard, MAX_LIST, PIECE_FX, PIECE_THEMES, kindOf, MAX_PIECES, PAGE_KINDS, PAGE_WIDGETS } from "../../../shared/constants";
import { ICON_NAMES, type BoardBox, type BoxAlign, type BoxFill, type RenderModel } from "../../../shared/types";
import { anchorShift, applyBoxLook, boardHeight, boardScale, boxInner, layerOf, loopOf, pieceLabel, widgetHTML } from "../../render/free";
import { watchLists } from "../../render/motion";
import { Stage } from "../../render/stage";
import { applyTheme } from "../../render/theme";
import { api } from "../../api";
import { store } from "../../state";
import { GRID, HANDLES, attachMoves } from "./pbmove";
import { chooseMedia } from "../../ui/media";
import { toast } from "../../ui/toast";
import { delegate, esc, must } from "../../util/dom";
import type { Pane } from "./fields";

/** The grip you hold to move a piece. */

/** Pieces you can have more than one of. */
const MULTI = new Set<string>(PAGE_KINDS.map(k => k.kind));

const ALIGN_LABELS: Record<BoxAlign, string> = { center: "Centre", left: "Left" };
const FILL_LABELS: Record<BoxFill, string> = { soft: "Soft", solid: "Solid", outline: "Outline", glass: "Glass", none: "None" };

/** Which setting each slider changes. */
const SLIDER_KEYS: Record<string, keyof BoardBox> = { sz: "size", h: "h", pad: "pad", radius: "radius", op: "opacity", bl: "blur", bd: "borderW", sh: "shadow", gl: "glow", ns: "nsz", nt: "ntr", av: "avs", bn: "bnh", th: "tha", fn: "fxn", cw: "cardW", rot: "rot", zm: "zoom", bga: "bga", gp: "gap", am: "animMs", ad: "animDelay", lm: "loopMs", pr: "par" };

/** The groups of options that are open. They stay open from one piece to the next. */
const OPEN = new Set<string>(["content", "place"]);

/** The room inside a piece, when the owner has not said otherwise. */
const DEFAULT_PAD = 16;
/** How much room is kept below the lowest piece, so there is always somewhere to drag one. */
const SLACK = 160;
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
    el.innerHTML = `<div class="pboard-wrap" data-pb-wrap><div class="pboard-bg" data-pb-bg></div>
      <div class="pboard-bar">
        <div class="pboard-chips" role="group" aria-label="Pieces of the page"></div>
        <span class="pboard-zoom" data-pb-zoom></span>
        <button class="btn-ghost" type="button" data-pb-reset>Put it back</button>
        <button class="btn-ghost pboard-full-btn" type="button" data-pb-full>Full screen</button>
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
    const wrap = must<HTMLElement>("[data-pb-wrap]", el);
    const bgHost = must<HTMLElement>("[data-pb-bg]", el);
    const fullBtn = must<HTMLElement>("[data-pb-full]", el);
    const cleanups: Array<() => void> = [];

    /** The piece whose options are open, if any. */
    let selected: string | null = null;
    /** When a drag or a resize last finished, so the click that ends it is not taken as a pick. */
    /** How big the board is drawn: as wide as the pane allows. */
    let scale = 1;
    /** Full screen shows the page the way a visitor's screen does: as wide as the screen. */
    let full = false;
    let bgStage: Stage | null = null;
    /** How wide the board is drawn, and how much wider that is than the board was made. */
    let bw = BOARD_W;
    let extra = 0;

    /** The boxes on the board. The profile keeps them, so they are the ones visitors get. */
    const boxes = (): BoardBox[] => {
      const p = store.profile;
      if (!p.page.board.length) p.page.board = defaultBoard();
      return p.page.board;
    };
    /** Whether an item sits in a group that is on the board. Such an item is drawn inside the group, not on the board. */
    const isChild = (b: BoardBox): boolean => Boolean(b.into) && boxes().some(g => g.id === b.into);
    const tops = (): BoardBox[] => boxes().filter(b => !isChild(b));
    const picked = (): BoardBox | undefined => (selected ? boxes().find(b => b.id === selected) : undefined);
    const cardOf = (id: string): HTMLElement | null => canvas.querySelector<HTMLElement>(`.fbox[data-widget="${id}"]`);

    /** The board is as tall as its lowest piece, plus room to drag one lower. */
    const grow = (): void => {
      const h = boardHeight(canvas, BOARD_H) + SLACK;
      canvas.style.height = `${h}px`;
      scaleBox.style.height = `${Math.round(h * scale)}px`;
      syncFrame();
    };

    /** The frame with the handles, drawn over the piece that is picked. It is not inside the piece, so the piece can never clip it. */
    let frame: HTMLElement | null = null;
    function syncFrame(): void {
      if (!frame || !frame.isConnected) return;
      const card = selected ? cardOf(selected) : null;
      frame.hidden = !card;
      if (!card) return;
      frame.dataset.for = selected ?? "";
      frame.classList.toggle("locked", Boolean(boxes().find(b => b.id === selected)?.locked));
      frame.style.left = `${card.offsetLeft}px`;
      frame.style.top = `${card.offsetTop}px`;
      frame.style.width = `${card.offsetWidth}px`;
      frame.style.height = `${card.offsetHeight}px`;
    }

    /** Put a piece where its box says, with the shift a wide screen gives it. */
    const layout = (box: BoardBox): void => {
      const card = cardOf(box.id);
      if (!card) return;
      const { ex, ew } = anchorShift(box.x, box.w, extra, box.anc);
      card.style.left = `${box.x + ex}px`;
      card.style.top = `${box.y}px`;
      card.style.width = `${box.w + ew}px`;
    };

    /** Draw the board as wide as the pane allows. The options keep their room beside it, so picking a piece never changes its size.
     *  In full screen the board is as wide as the screen, the way a visitor sees it. */
    const fit = (): void => {
      if (full) {
        const avail = Math.max(320, wrap.clientWidth);
        main.classList.remove("beside");
        scale = avail > BOARD_W ? 1 : boardScale(avail);
        bw = avail > BOARD_W ? avail : BOARD_W;
      } else {
        const room = el.clientWidth - 44;
        main.classList.remove("beside");
        scale = boardScale(room);
        bw = BOARD_W;
      }
      const next = bw - BOARD_W;
      const moved = next !== extra;
      extra = next;
      canvas.style.width = `${bw}px`;
      canvas.style.transform = `scale(${scale})`;
      canvas.style.setProperty("--inv", String(Math.min(2.2, 1 / scale)));
      scaleBox.style.width = `${Math.round(bw * scale)}px`;
      zoom.textContent = full ? `${Math.round(bw * scale)}px wide` : `${Math.round(scale * 100)}%`;
      if (moved) for (const b of tops()) layout(b);
      grow();
    };

    /** Where a new piece can go without landing on another one. */
    const findSpot = (w: number, h: number): { x: number; y: number } => {
      const rects = tops().map(b => {
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
      applyBoxLook(card, box);
      card.classList.toggle("is-locked", Boolean(box.locked));
      if (box.fixedH) card.style.height = `${box.h}px`;
      if (box.id === selected) card.classList.add("sel");
      const body = model ? widgetHTML(box.id, model, box) : "";
      card.innerHTML = `${boxInner(body, box)}<span class="pbtag">${esc(pieceLabel(box))}</span>`;
      canvas.append(card);
      layout(box);

      // The arrow keys move a piece too, so this is not mouse-only.
      card.addEventListener("keydown", e => {
        const step = e.shiftKey ? GRID * 4 : GRID;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (!dx && !dy) return;
        e.preventDefault();
        const x = Math.max(0, Math.min(BOARD_W - box.w, box.x + dx));
        const y = Math.max(0, Math.min(MAX_Y, box.y + dy));
        box.x = x;
        box.y = y;
        layout(box);
        grow();
        store.profileChanged();
      });
    };

    /** The menus that add and remove pieces. Each one is a drop down, so the bar stays tidy. */
    const drawChips = (): void => {
      const list = boxes();
      const labelOfWidget = (id: string): string => PAGE_WIDGETS.find(w => w.id === id)?.label ?? id;
      const labelOfKind = (k: string): string => PAGE_KINDS.find(x => x.kind === k)?.label ?? k;
      /** A piece you have one of: pressing it puts it on the board or takes it off. */
      const toggle = (id: string): string => {
        const on = list.some(b => b.id === id);
        return `<button class="pboard-dd-i${on ? " on" : ""}" type="button" data-pb-piece="${esc(id)}" aria-pressed="${on}"><i>${on ? "✓" : "+"}</i>${esc(labelOfWidget(id))}</button>`;
      };
      /** A piece you can have many of: pressing it adds another. */
      const add = (k: string): string => `<button class="pboard-dd-i" type="button" data-pb-add="${k}"><i>+</i>${esc(labelOfKind(k))}</button>`;
      const menus: Array<[string, string]> = [
        ["Page", [toggle("profile"), toggle("links"), toggle("views")].join("")],
        ["Music", [toggle("music"), toggle("lyrics"), toggle("discord")].join("")],
        ["Content", [add("text"), add("image"), add("item"), add("group"), add("divider")].join("")],
        ["About me", [add("games"), add("listen")].join("")],
        ["Move around", [add("page"), add("jump"), add("rail")].join("")],
      ];
      chips.innerHTML = menus.map(([name, items]) => `<details class="pboard-dd" data-dd><summary class="chip">${esc(name)}<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary><div class="pboard-dd-list">${items}</div></details>`).join("");
    };

    /** The middle of what you can see of the board, as a place for a new piece of this size. */
    const centreSpot = (w: number, h: number): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect();
      const left = Math.max(r.left, 0);
      const right = Math.min(r.right, window.innerWidth);
      const top = Math.max(r.top, 0);
      const bottom = Math.min(r.bottom, window.innerHeight);
      const cx = right > left ? (left + right) / 2 : (r.left + r.right) / 2;
      const cy = bottom > top ? (top + bottom) / 2 : r.top;
      // A piece in the middle of the board is shifted by half of what a wide screen adds, so that is taken back out.
      const x = (cx - r.left) / scale - extra / 2 - w / 2;
      const y = (cy - r.top) / scale - h / 2;
      let px = Math.max(0, Math.min(BOARD_W - w, Math.round(x / GRID) * GRID));
      let py = Math.max(0, Math.min(MAX_Y - h, Math.round(y / GRID) * GRID));
      // Pieces added one after another step down and across a little, so one never hides another exactly.
      for (let n = 0; n < 12 && tops().some(b => Math.abs(b.x - px) < 16 && Math.abs(b.y - py) < 16); n++) {
        px = Math.min(BOARD_W - w, px + 24);
        py = Math.min(MAX_Y - h, py + 24);
      }
      return { x: px, y: py };
    };

    /** A word about whether this board is the one being shown. */
    const drawNote = (): void => {
      note.innerHTML = store.profile.page.layout === "experimental"
        ? "This is the board your visitors see. Drag a piece to move it, pull its edges or corners to resize it, and click it to change how it looks. Lines show when it lines up with something. Hold Alt to move without snapping, and press Esc to put it back. On a phone the pieces are stacked in a column."
        : `Your page is set to <b>Regular</b>, so this board is not shown yet. <button class="btn-ghost" type="button" data-pb-experimental>Use the experimental layout</button>`;
    };

    /** The options of the piece that is picked. */
    /**
     * Put new markup in the options panel without losing where the person was: the panel and every
     * scrolling box around it keep their scroll, and the panel keeps its height while it is rebuilt, so the
     * page cannot shrink and jump to the top. A different piece starts at the top.
     */
    let optsFor = "";
    const setOpts = (html: string, who: string): void => {
      const same = who === optsFor;
      optsFor = who;
      const inner = opts.firstElementChild as HTMLElement | null;
      const innerTop = inner?.scrollTop ?? 0;
      const held: Array<{ node: Element; top: number }> = [];
      if (same) {
        for (let n: Element | null = opts.parentElement; n; n = n.parentElement) {
          const o = getComputedStyle(n).overflowY;
          if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) held.push({ node: n, top: n.scrollTop });
        }
        const root = document.scrollingElement;
        if (root) held.push({ node: root, top: root.scrollTop });
        opts.style.minHeight = `${opts.offsetHeight}px`;
      }
      opts.innerHTML = html;
      if (same) {
        const next = opts.firstElementChild as HTMLElement | null;
        if (next) next.scrollTop = innerTop;
        for (const h of held) h.node.scrollTop = h.top;
        opts.style.minHeight = "";
        for (const h of held) h.node.scrollTop = h.top;
      }
    };

    /** Run a redraw of the options without the panel, or the page around it, jumping back to the top. */
    const keepScroll = (redraw: () => void): void => {
      const saved: Array<[Element, number]> = [];
      for (let n: Element | null = opts; n; n = n.parentElement) {
        if (n.scrollHeight > n.clientHeight) saved.push([n, n.scrollTop]);
      }
      const inner = opts.querySelector<HTMLElement>(".pboard-opts-in");
      const innerTop = inner ? inner.scrollTop : 0;
      const winY = window.scrollY;
      redraw();
      const again = opts.querySelector<HTMLElement>(".pboard-opts-in");
      if (again) again.scrollTop = innerTop;
      for (const [n, top] of saved) n.scrollTop = top;
      if (window.scrollY !== winY) window.scrollTo({ top: winY });
    };
    /** The cover search of a games or music list: what was found, and which entry it is for (none: a new entry). */
    let hits: Array<{ name: string; sub?: string; cover: string; thumb: string }> = [];
    let hitNote = "";
    let findIdx: number | null = null;
    let findQ = "";
    const doFind = async (): Promise<void> => {
      const box = picked();
      if (!box) return;
      const q = findQ.trim();
      hits = [];
      if (q.length < 2) { hitNote = "Type at least two letters."; drawOpts(); return; }
      hitNote = "Searching…";
      drawOpts();
      try {
        hits = (await api.covers(kindOf(box.id) === "listen" ? "music" : "game", q)).results;
        hitNote = hits.length ? "" : "Nothing found. Add it without searching, then give it a cover of your own.";
      } catch (e) {
        hitNote = e instanceof Error ? e.message : "The search failed.";
      }
      drawOpts();
    };
    const drawOpts = (): void => keepScroll(drawOptsNow);
    const drawOptsNow = (): void => {
      const box = picked();
      if (!box) {
        setOpts(`<div class="pboard-opts-in pboard-opts-empty"><b>Pieces</b><p class="note">Click a piece on the board to change how it looks: its place, fill, see-through, blur, border, shadow, layer, inside space and corners. Drag a piece to move it, and pull its edges or corners to resize it.</p><p class="note"><b>Page</b> adds another screen to your page. <b>Button</b> adds a button that scrolls to one.</p></div>`, "");
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
      const colorRow = (label: string, attr: string, value: string | undefined, clear: string, fallback: string, clearLabel: string): string =>
        `<div class="pboard-opt"><span>${esc(label)}</span><div class="pboard-colorrow"><input type="color" data-pb-${attr} value="${esc(value ?? fallback)}" aria-label="${esc(label)}"><button type="button" class="seg-btn" data-pb-${clear}${value ? "" : " disabled"}>${esc(clearLabel)}</button></div></div>`;
      const colorIn = colorRow("Colour", "color", box.color, "color-clear", "#ffffff", "Use the page colour");
      const marks = kind === "rail" || kind === "divider";
      const setSeg = (key: string, value: string, label: string, on: boolean): string =>
        `<button type="button" class="seg-btn" data-pb-set="${key}:${value}" aria-pressed="${on}">${esc(label)}</button>`;
      const flag = (key: string, label: string, on: boolean): string =>
        `<label class="pboard-switch"><input type="checkbox" data-pb-flag="${key}"${on ? " checked" : ""}> ${esc(label)}</label>`;
      const num = (key: string, label: string, value: number, min: number, max: number): string =>
        `<label><span>${esc(label)}</span><input type="number" data-pb-num="${key}" min="${min}" max="${max}" step="1" value="${Math.round(value)}"></label>`;
      const group = (id: string, title: string, body: string): string =>
        body ? `<details class="pboard-grp" data-grp="${id}"${OPEN.has(id) ? " open" : ""}><summary>${esc(title)}</summary><div class="pboard-grp-in">${body}</div></details>` : "";
      const targets = `<label class="pboard-opt"><span>Scrolls to</span><select class="pboard-text" data-pb-target>
               <option value="top"${target === "top" ? " selected" : ""}>The top of the page</option>
               ${pages.map(pg => `<option value="${esc(pg.id)}"${target === pg.id ? " selected" : ""}>${esc(pieceLabel(pg))}</option>`).join("")}
             </select></label>`;
      let words = "";
      if (kind === "page") {
        words = `${textIn("label", "Title of this page", box.label ?? "", "No title")}
           <p class="note">A page is a panel of your board. Put pieces on top of it, then add a Button or a Scroll rail to move between pages.</p>`;
      } else if (kind === "jump") {
        words = `${textIn("label", "Button text", box.label ?? "", "Scroll down")}${targets}`;
      } else if (kind === "rail") {
        const dock = box.dock ?? "here";
        words = `<div class="pboard-opt"><span>Where it sits</span><div class="seg" role="group" aria-label="Where it sits">${seg("dock", "right", "Right of the screen", dock === "right")}${seg("dock", "left", "Left of the screen", dock === "left")}${seg("dock", "here", "Here on the board", dock === "here")}</div></div>
           <div class="pboard-opt"><span>Marks</span><div class="seg" role="group" aria-label="Marks">${seg("look", "bar", "Bars", box.look !== "dot")}${seg("look", "dot", "Dots", box.look === "dot")}</div></div>
           ${slider("sz", "Thickness", box.size ?? 3, 1, 12, "px")}${colorIn}
           <p class="note">The rail has one mark for the top and one for each page. The page you are on is shown long. On the screen it stays in place as you scroll.</p>`;
      } else if (kind === "text") {
        words = `${textIn("label", "Heading", box.label ?? "", "No heading")}
           <label class="pboard-opt"><span>Text</span><textarea class="pboard-text" data-pb-text maxlength="600" placeholder="Write something">${esc(box.text ?? "")}</textarea></label>`;
      } else if (kind === "image") {
        words = `${textIn("url", "Picture or video address", box.url ?? "", "https://…", 500)}<button class="btn-ghost" type="button" data-pb-pick style="justify-content:center">Or choose a file from your device</button>${textIn("label", "Describe it (for screen readers)", box.label ?? "", "A short description")}
           <div class="pboard-opt"><span>Fills the piece</span><div class="seg" role="group" aria-label="Fills the piece">${seg("look", "cover", "Cover", box.look !== "contain")}${seg("look", "contain", "Fit inside", box.look === "contain")}</div></div>`;
      } else if (kind === "divider") {
        words = `${slider("sz", "Thickness", box.size ?? 2, 1, 12, "px")}${colorIn}`;
      } else if (kind === "profile") {
        const me = store.me;
        const missingTag = box.handle === "discord" && !me?.user.discordTag;
        words = `${textIn("str-ntext", "Name shown", box.ntext ?? "", store.profile.name || "Your name", 40)}
           <div class="pboard-opt"><span>Under the name</span><div class="seg" role="group" aria-label="Under the name">${setSeg("handle", "site", "Your page name", (box.handle ?? "site") === "site")}${setSeg("handle", "discord", "Discord username", box.handle === "discord")}${setSeg("handle", "none", "Nothing", box.handle === "none")}</div></div>
           ${missingTag ? `<p class="note">Your Discord username isn't known for this page. Log in with Discord to bring it in.</p>` : ""}
           ${flag("stag", "Show my Discord server tag", Boolean(box.stag))}
           ${box.stag && !me?.user.serverTag ? `<p class="note">No server tag is known for this account. Pick one in Discord (Settings → Profiles → Server Tag), then log in with Discord again.</p>` : ""}
           ${flag("banner", "Show my Discord banner", Boolean(box.banner))}
           ${box.banner ? `${slider("bn", "Banner height", box.bnh ?? 110, 60, 260, "px", 5)}${me?.user.discordBannerUrl || me?.user.discordAccent ? "" : `<p class="note">This account has no Discord banner or colour yet, so nothing shows. If you just added one, log in with Discord again.</p>`}` : ""}
           ${flag("noav", "Hide the picture", Boolean(box.noav))}
           ${box.noav ? "" : slider("av", "Picture size", box.avs ?? 96, 40, 220, "px", 4)}`;
      } else if (kind === "games" || kind === "listen") {
        const items = box.items ?? [];
        const noun = kind === "games" ? "game" : "song or album";
        const hitsHTML = hits.length
          ? `<div class="pboard-hits">${hits.map((h, i) => `<button type="button" class="pboard-hit" data-pb-hit="${i}"><span class="pboard-hit-art" style="background-image:url(${esc(h.thumb)})"></span><span><b>${esc(h.name)}</b>${h.sub ? `<small>${esc(h.sub)}</small>` : ""}</span></button>`).join("")}</div>`
          : hitNote ? `<p class="note">${esc(hitNote)}</p>` : "";
        const rows = items.map((it, i) => `<div class="pboard-li">
            <div class="pboard-li-top"><span class="pboard-li-art"${it.c ? ` style="background-image:url(${esc(it.c)})"` : ""}>${it.c ? "" : esc(it.n.charAt(0).toUpperCase())}</span>
              <input type="text" class="pboard-text" data-pb-li="${i}:n" maxlength="60" value="${esc(it.n)}" aria-label="Name"></div>
            <input type="text" class="pboard-text" data-pb-li="${i}:s" maxlength="40" placeholder="${kind === "games" ? "Small line, like ★ 8.9" : "Artist"}" value="${esc(it.s ?? "")}" aria-label="Small line">
            <input type="text" class="pboard-text" data-pb-li="${i}:c" maxlength="500" placeholder="Cover picture address" value="${esc(it.c ?? "")}" aria-label="Cover address">
            <div class="seg">
              <button type="button" class="seg-btn" data-pb-li-find="${i}">Find cover</button>
              <button type="button" class="seg-btn" data-pb-li-file="${i}">Upload</button>
              <button type="button" class="seg-btn" data-pb-li-up="${i}"${i === 0 ? " disabled" : ""} aria-label="Move earlier">↑</button>
              <button type="button" class="seg-btn" data-pb-li-down="${i}"${i === items.length - 1 ? " disabled" : ""} aria-label="Move later">↓</button>
              <button type="button" class="seg-btn" data-pb-li-del="${i}" aria-label="Remove">✕</button>
            </div></div>`).join("");
        words = `<div class="pboard-opt"><span>${findIdx === null ? `Add a ${noun}` : `Find a cover for “${esc(items[findIdx]?.n ?? "")}”`}</span>
            <div class="pboard-search"><input type="search" class="pboard-text" data-pb-find placeholder="${kind === "games" ? "Search for a game" : "Search for a song or album"}" value="${esc(findQ)}" maxlength="80"><button class="btn-ghost" type="button" data-pb-find-go>Search</button></div></div>
          ${hitsHTML}
          ${findIdx === null ? `<button class="btn-ghost" type="button" data-pb-li-blank style="justify-content:center"${items.length >= MAX_LIST ? " disabled" : ""}>Add one without searching</button>` : `<button class="btn-ghost" type="button" data-pb-find-cancel style="justify-content:center">Cancel</button>`}
          ${rows}
          ${slider("cw", "Card width", box.cardW ?? 172, 110, 320, "px", 2)}
          <div class="pboard-opt"><span>Card motion</span><div class="seg" role="group" aria-label="Card motion">${setSeg("lmo", "flow", "Flow", (box.lmo ?? "flow") === "flow")}${setSeg("lmo", "slide", "Slide", box.lmo === "slide")}${setSeg("lmo", "none", "None", box.lmo === "none")}</div></div>
          ${flag("dots", "Show the dots under the cards", box.dots !== false)}
          <p class="note">${kind === "games" ? "Covers come from the Steam store. A game that is not on Steam needs a cover of your own: paste an address or upload one." : "Covers come from the iTunes catalogue. Add your own for anything it cannot find."} Found covers are saved to your own uploads.</p>`;
      } else if (kind === "item") {
        const mode = box.mode ?? "link";
        const groups = boxes().filter(b => kindOf(b.id) === "group");
        const icons = ICON_NAMES.map(n => `<option value="${n}"${(box.icon ?? (mode === "link" ? "auto" : "none")) === n ? " selected" : ""}>${n === "auto" ? "Pick from the address" : n[0]!.toUpperCase() + n.slice(1)}</option>`).join("");
        words = `<div class="pboard-opt"><span>This is</span><div class="seg" role="group" aria-label="This is">${setSeg("mode", "link", "A link", mode === "link")}${setSeg("mode", "text", "Just text", mode === "text")}</div></div>
           ${textIn("label", mode === "link" ? "Button text" : "Text", box.label ?? "", mode === "link" ? "My link" : "Write something", 80)}
           ${textIn("text", "Small line under it", box.text ?? "", "Optional", 80)}
           ${textIn("url", mode === "link" ? "Link address" : "Make it a link (optional)", box.url ?? "", "https://…", 500)}
           <label class="pboard-opt"><span>Little picture</span><select class="pboard-text" data-pb-icon><option value="none"${(box.icon ?? (mode === "link" ? "auto" : "none")) === "none" ? " selected" : ""}>None</option>${icons}</select></label>
           <label class="pboard-opt"><span>Group</span><select class="pboard-text" data-pb-into><option value="">On its own</option>${groups.map(g => `<option value="${esc(g.id)}"${box.into === g.id ? " selected" : ""}>${esc(pieceLabel(g))}</option>`).join("")}</select></label>
           ${box.into ? `<div class="pboard-opt"><span>Order in the group</span><div class="seg" role="group" aria-label="Order">${act("item-up", "Move up")}${act("item-down", "Move down")}</div></div>` : ""}`;
      } else if (kind === "group") {
        const flow = box.flow ?? "col";
        words = `${textIn("label", "Title (optional)", box.label ?? "", "No title")}
           <div class="pboard-opt"><span>Items go</span><div class="seg" role="group" aria-label="Items go">${setSeg("flow", "col", "Down", flow === "col")}${setSeg("flow", "row", "Across", flow === "row")}${setSeg("flow", "grid", "In a grid", flow === "grid")}</div></div>
           ${slider("gp", "Space between", box.gap ?? 10, 0, 48, "px")}
           <button class="btn-ghost" type="button" data-pb-additem style="justify-content:center">+ Add a link or text here</button>
           <p class="note">${boxes().filter(b => b.into === box.id).length} in this group. Pick an item to change it, move it up or down, or take it out of the group.</p>`;
      } else if (kind === "lyrics") {
        words = `<p class="note">The lyrics of the song that is playing show here, instead of floating over the page. Nothing shows until a song plays.</p>`;
      } else if (kind === "music" || kind === "discord") {
        words = `<p class="note">This shows when ${kind === "music" ? "one of your songs is playing" : "Discord has something to show"}. Until then it is hidden on your page.</p>`;
      }

      const child = isChild(box);
      const nums = child ? "" : `<div class="pboard-nums">${num("x", "Left", box.x, 0, BOARD_W)}${num("y", "Top", box.y, 0, MAX_Y)}${num("w", "Width", box.w, 20, 3000)}${num("h", "Height", box.h, 16, 3000)}</div>`;
      const vAlign = box.valign ?? "middle";

      const groups = [
        group("content", "Content", words),
        child ? "" : group("place", "Position and size", `
          <div class="pboard-opt"><span>Put it at</span><div class="seg" role="group" aria-label="Put it at">${act("at-left", "Left edge")}${act("at-center", "Centre")}${act("at-right", "Right edge")}${act("at-top", "Top edge")}${act("at-full", "Full width")}</div></div>
          ${nums}
          <div class="pboard-opt"><span>Height</span><div class="seg" role="group" aria-label="Height">${seg("height", "auto", "Fit the content", !box.fixedH)}${seg("height", "fixed", "Fixed", Boolean(box.fixedH))}</div></div>
          ${box.fixedH ? slider("h", "Piece height", Math.min(1600, box.h), 16, 1600, "px", 8) : ""}
          <div class="pboard-opt"><span>Line up</span><div class="seg" role="group" aria-label="Line up">${BOX_ALIGNS.map(a => seg("align", a, ALIGN_LABELS[a], a === align)).join("")}</div></div>
          <div class="pboard-opt"><span>Up and down</span><div class="seg" role="group" aria-label="Up and down">${setSeg("valign", "top", "Top", vAlign === "top")}${setSeg("valign", "middle", "Middle", vAlign === "middle")}${setSeg("valign", "bottom", "Bottom", vAlign === "bottom")}</div></div>
          ${flag("locked", "Lock it in place (no moving or resizing)", Boolean(box.locked))}
          ${flag("ratio", "Keep its shape when a corner is pulled", Boolean(box.ratio))}
          <p class="note">Hold Shift while pulling a corner to keep the shape for one pull. Hold Alt to move without snapping. Arrow keys nudge the picked piece.</p>`),
        group("fill", "Fill and colour", `
          <div class="pboard-opt"><span>Fill</span><div class="seg" role="group" aria-label="Fill">${BOX_FILLS.map(f => seg("fill", f, FILL_LABELS[f], f === fill)).join("")}</div></div>
          ${colorRow("Background colour", "bgc", box.bg, "bgc-clear", "#111111", "Remove it")}
          ${box.bg ? slider("bga", "How solid it is", box.bga ?? 100, 0, 100, "%") : ""}
          ${slider("op", "See-through", box.opacity ?? 100, 20, 100, "%")}
          ${slider("bl", "Blur behind", box.blur ?? 0, 0, 40, "px")}`),
        group("border", "Border and shadow", `
          ${slider("bd", "Border", box.borderW ?? 1, 0, 8, "px")}
          <div class="pboard-opt"><span>Border line</span><div class="seg" role="group" aria-label="Border line">${(["solid", "dashed", "dotted", "double"] as const).map(b => setSeg("bstyle", b, b[0]!.toUpperCase() + b.slice(1), (box.bstyle ?? "solid") === b)).join("")}</div></div>
          ${colorRow("Border colour", "bcc", box.bc, "bcc-clear", "#ffffff", "Use the page colour")}
          ${slider("sh", "Shadow", box.shadow ?? 0, 0, 100, "%")}
          ${slider("gl", "Glow", box.glow ?? 0, 0, 100, "%")}`),
        group("shape", "Shape and space", `
          ${slider("radius", "Corners", radius, 0, 48, "px")}
          ${slider("pad", "Inside space", pad, 0, 48, "px")}
          ${slider("rot", "Tilt", box.rot ?? 0, -15, 15, "°")}`),
        group("text", "Text", `
          ${marks ? "" : colorIn.replace("Colour", "Text colour").replace('aria-label="Colour"', 'aria-label="Text colour"')}
          ${slider("zm", "Size of everything inside", box.zoom ?? 100, 60, 160, "%", 5)}`),
        kind === "profile" ? group("namelook", "Name style", `
          ${slider("ns", "Name size", box.nsz ?? store.profile.nameSize, 14, 96, "px")}
          <div class="pboard-opt"><span>Weight</span><div class="seg" role="group" aria-label="Weight">${([400, 500, 600, 700, 800] as const).map(w => setSeg("nwt", String(w), String(w), (box.nwt ?? store.profile.nameWeight) === w)).join("")}</div></div>
          ${colorRow("Name colour", "col-ncol", box.ncol, "col-clear-ncol", "#ffffff", "Use the page colour")}
          ${slider("nt", "Letter spacing", box.ntr ?? store.profile.nameTracking, -6, 20, "")}
          <div class="pboard-opt"><span>Capitals</span><div class="seg" role="group" aria-label="Capitals">${setSeg("ncase", "normal", "As typed", (box.ncase ?? "normal") === "normal")}${setSeg("ncase", "upper", "ABC", box.ncase === "upper")}${setSeg("ncase", "lower", "abc", box.ncase === "lower")}</div></div>
          <div class="pboard-opt"><span>Style</span><div class="seg" role="group" aria-label="Name style">${setSeg("nfx", "plain", "Plain", (box.nfx ?? (store.profile.nameGradient ? "gradient" : store.profile.nameGlow ? "glow" : "plain")) === "plain")}${setSeg("nfx", "glow", "Glow", (box.nfx ?? (store.profile.nameGradient ? "gradient" : store.profile.nameGlow ? "glow" : "plain")) === "glow")}${setSeg("nfx", "gradient", "Gradient", (box.nfx ?? (store.profile.nameGradient ? "gradient" : store.profile.nameGlow ? "glow" : "plain")) === "gradient")}</div></div>`) : "",
        group("theme", "Theme and effect", `
          <div class="pboard-opt"><span>Theme</span><div class="pboard-themes" role="group" aria-label="Theme">
            <button type="button" class="pboard-theme none" data-pb-set="theme:none" aria-pressed="${!box.theme}" title="No theme">∅</button>
            ${Object.entries(PIECE_THEMES).map(([k, [a, b]]) => `<button type="button" class="pboard-theme" data-pb-set="theme:${k}" aria-pressed="${box.theme === k}" title="${k}" style="--a:${a};--b:${b}"></button>`).join("")}
            <button type="button" class="pboard-theme custom" data-pb-set="theme:custom" aria-pressed="${box.theme === "custom"}" title="Pick your own colours" style="--a:${box.tc1 ?? "#7c3aed"};--b:${box.tc2 ?? "#db2777"}"></button></div></div>
          ${box.theme === "custom" ? `<div class="pboard-opt"><span>Your two colours</span><div class="pboard-colorrow"><input type="color" data-pb-col="tc1" value="${esc(box.tc1 ?? "#7c3aed")}" aria-label="First colour"><input type="color" data-pb-col="tc2" value="${esc(box.tc2 ?? "#db2777")}" aria-label="Second colour"></div></div>` : ""}
          ${box.theme ? slider("th", "How strong the theme is", box.tha ?? 38, 10, 90, "%") : ""}
          <div class="pboard-opt"><span>Effect over it</span><div class="seg wrap" role="group" aria-label="Effect">${PIECE_FX.map(f => setSeg("fx", f, f === "none" ? "Nothing" : f[0]!.toUpperCase() + f.slice(1), (box.fx ?? "none") === f)).join("")}</div></div>
          ${box.fx && box.fx !== "none" ? slider("fn", "How much of it", box.fxn ?? 30, 5, 80, "") : ""}`),
        group("motion", "Animation", `
          <div class="pboard-opt"><span>How it arrives</span><div class="seg wrap" role="group" aria-label="Arrival">${BOX_ANIMS.map(a => setSeg("anim", a, a === "none" ? "Nothing" : a[0]!.toUpperCase() + a.slice(1), (box.anim ?? "none") === a)).join("")}</div></div>
          ${box.anim && box.anim !== "none" ? `
            ${slider("am", "How long it takes", box.animMs ?? 800, 200, 3000, "ms", 50)}
            ${slider("ad", "Wait before it arrives", box.animDelay ?? 0, 0, 3000, "ms", 50)}
            <div class="pboard-opt"><span>It arrives</span><div class="seg" role="group" aria-label="When it arrives">${setSeg("animOn", "load", "When the page opens", (box.animOn ?? "load") === "load")}${setSeg("animOn", "view", "When scrolled to", box.animOn === "view")}</div></div>` : ""}
          <div class="pboard-opt"><span>It keeps moving</span><div class="seg wrap" role="group" aria-label="Movement">${BOX_LOOPS.map(l => setSeg("loop", l, l === "none" ? "Still" : l[0]!.toUpperCase() + l.slice(1), (loopOf(box) ?? "none") === l)).join("")}</div></div>
          ${loopOf(box) ? slider("lm", "Time for one round", box.loopMs ?? 4000, 600, 12000, "ms", 100) : ""}
          ${slider("pr", "Drifts as the page scrolls", box.par ?? 0, -60, 60, "%")}
          <div class="pboard-opt"><span>When the pointer is over it</span><div class="seg wrap" role="group" aria-label="Hover">${BOX_HOVERS.map(h => setSeg("hover", h, h === "none" ? "Nothing" : h[0]!.toUpperCase() + h.slice(1), (box.hover ?? "none") === h)).join("")}</div></div>
          <button class="btn-ghost" type="button" data-pb-play style="justify-content:center">▶ Play the animation</button>
          <p class="note">Pieces keep still while you edit. Play shows how this one moves on your page.</p>`),
        child ? "" : group("layer", "Layer and phones", `
          <div class="pboard-opt"><span>Layer <em>${layer}</em></span><div class="seg" role="group" aria-label="Layer">${act("back", "Send back")}${act("forward", "Bring forward")}</div></div>
          ${flag("hideMobile", "Leave it out on phones", Boolean(box.hideMobile))}`),
      ].join("");

      setOpts(`<div class="pboard-opts-in">
        <div class="pboard-opts-head">
          <span class="pboard-opts-name">${esc(pieceLabel(box))}</span>
          <button class="btn-ghost" type="button" data-pb-match>Reset look</button>
          <button class="btn-ghost pboard-side-btn" type="button" data-pb-side title="Move these options to the other side of the screen">⇆</button>
          <button class="btn-ghost" type="button" data-pb-close>Done</button>
        </div>
        ${groups}
        <p class="note">What is inside a piece is laid out at its own size, the same as on the usual page.</p>
        ${MULTI.has(kind) ? `<div class="seg"><button class="seg-btn" type="button" data-pb-copy>Make a copy</button><button class="btn-ghost danger" type="button" data-pb-remove>Remove this ${esc((PAGE_KINDS.find(k => k.kind === kind)?.label ?? "piece").toLowerCase())}</button></div>` : ""}
      </div>`, box.id);
    };

    /** Draw everything. */
    const draw = (): void => keepScroll(drawNow);
    const drawNow = (): void => {
      for (const fn of cleanups.splice(0)) fn();
      canvas.innerHTML = "";
      const model = store.model;
      if (model) applyTheme(canvas, model);
      for (const box of tops()) place(box, model);
      frame = document.createElement("div");
      frame.className = "pb-frame";
      frame.hidden = true;
      frame.innerHTML = HANDLES.map(h => `<span class="pbh" data-h="${h}" aria-hidden="true"></span>`).join("");
      canvas.append(frame);
      syncFrame();
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
    let listsOff: (() => void) | null = null;
    const watch = (): void => {
      inner?.disconnect();
      for (const c of canvas.querySelectorAll(".fbox-in")) inner?.observe(c);
      listsOff?.();
      listsOff = watchLists(canvas);
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
      timer = window.setTimeout(() => {
        // Someone is typing in one of the options: drawing the panel again now would take the box out from under them.
        const at = document.activeElement;
        if (at && opts.contains(at) && /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName)) return;
        draw(); watch(); if (bgStage && store.model) bgStage.update(store.model); }, 0);
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
      card.classList.toggle("is-locked", Boolean(box.locked));
      card.style.height = box.fixedH ? `${box.h}px` : "";
      grow();
    };
    const commit = (): void => { store.profileChanged(); };
    /** Whether the owner moved the options to a side themselves. Until then they go to the side away from the piece. */
    let sideChosen = false;
    const pick = (id: string | null): void => {
      if (id !== selected) { findIdx = null; findQ = ""; hits = []; hitNote = ""; }
      selected = id;
      const at = id ? cardOf(id)?.getBoundingClientRect() : null;
      if (at && !sideChosen) wrap.dataset.side = (at.left + at.right) / 2 > window.innerWidth / 2 ? "left" : "right";
      for (const card of canvas.querySelectorAll<HTMLElement>(".fbox")) card.classList.toggle("sel", card.dataset.widget === selected);
      syncFrame();
      drawOpts();
    };

    /** Full screen: the board as wide as the screen, on top of the page's own background. */
    const setFull = (on: boolean): void => {
      if (on === full) return;
      full = on;
      wrap.classList.toggle("is-full", on);
      fullBtn.textContent = on ? "Exit full screen" : "Full screen";
      if (on) {
        const model = store.model;
        if (model) { bgStage = new Stage(model); bgHost.append(bgStage.el); }
        wrap.scrollTop = 0;
        void wrap.requestFullscreen?.().catch(() => {});
      } else {
        bgStage?.destroy();
        bgStage = null;
        wrap.dataset.fsReady = "";
        if (document.fullscreenElement === wrap) void document.exitFullscreen().catch(() => {});
      }
      fit();
      for (const b of tops()) layout(b);
      grow();
    };
    const onFullChange = (): void => { if (full && !document.fullscreenElement && wrap.dataset.fsReady === "1") setFull(false); };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      // Escape closes an open menu first, and leaves full screen the next time.
      if (el.querySelector("details[data-dd][open]")) { closeMenus(); return; }
      if (full) setFull(false);
    };
    const onWinResize = (): void => { if (full) fit(); };
    const onFsChange = (): void => {
      if (document.fullscreenElement === wrap) wrap.dataset.fsReady = "1";
      onFullChange();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onWinResize);

    /** Close every drop down. */
    const closeMenus = (except?: Element | null): void => {
      for (const d of el.querySelectorAll<HTMLDetailsElement>("details[data-dd]")) if (d !== except) d.open = false;
    };
    const onDocClick = (e: MouseEvent): void => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t?.closest("details[data-dd]")) closeMenus();
    };
    document.addEventListener("click", onDocClick);
    // Opening one menu closes the others.
    el.addEventListener("toggle", e => { const d = e.target; if (d instanceof HTMLDetailsElement && d.open && d.hasAttribute("data-dd")) closeMenus(d); }, true);

    /** Moving and resizing. One handler for the whole board, so a redraw never leaves a drag half done. */
    const scrollParent = (): HTMLElement | null => {
      for (let n: HTMLElement | null = canvas.parentElement; n; n = n.parentElement) {
        const o = getComputedStyle(n).overflowY;
        if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n;
      }
      return document.scrollingElement as HTMLElement | null;
    };
    const detachMoves = attachMoves({
      canvas,
      scale: () => scale,
      width: () => bw,
      boxes: tops,
      cardOf,
      scroller: scrollParent,
      tick: grow,
      tap: id => pick(selected === id ? null : id),
      commit: (box, changed) => {
        const card = cardOf(box.id);
        if (card) card.style.height = box.fixedH ? `${box.h}px` : "";
        layout(box);
        grow();
        if (!changed) return;
        pick(box.id);
        store.profileChanged();
      },
    });

    const offs = [
      delegate(el, "click", "[data-pb-full]", () => setFull(!full)),
      // Which groups of options are open stays the same from one piece to the next.
      (() => {
        const onToggle = (e: Event): void => {
          const d = e.target;
          if (!(d instanceof HTMLDetailsElement) || !d.dataset.grp) return;
          if (d.open) OPEN.add(d.dataset.grp); else OPEN.delete(d.dataset.grp);
        };
        opts.addEventListener("toggle", onToggle, true);
        return () => opts.removeEventListener("toggle", onToggle, true);
      })(),
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
          const spot = centreSpot(piece.w, piece.h);
          list.push({ id, x: spot.x, anc: "c", y: spot.y, w: piece.w, h: piece.h });
          selected = id;
        }
        closeMenus();
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

      // Clicking an empty part of the board puts the options away.
      delegate(el, "click", ".pboard-canvas", (e, t) => {
        if (e.target === t && selected) pick(null);
      }),
      delegate(el, "click", "[data-pb-close]", () => pick(null)),
      delegate(el, "click", "[data-pb-side]", () => { sideChosen = true; wrap.dataset.side = wrap.dataset.side === "left" ? "right" : "left"; }),
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
        for (const k of ["valign", "bg", "bga", "bstyle", "bc", "glow", "rot", "zoom", "hover", "anim", "float", "hideMobile", "color"] as const) delete box[k];
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
        if (key === "gap") refresh(box);
        const readout = opts.querySelector<HTMLElement>(`[data-pb-${input.dataset.key}-val]`);
        if (readout) readout.textContent = `${input.value}${input.dataset.unit ?? ""}`;
      }),
      delegate(el, "change", "[data-pb-range]", (_e, t) => {
        commit();
        // How much of an effect there is changes what is drawn, not just a look.
        if (t.dataset.key === "fn") { draw(); watch(); }
      }),

      // Where the piece sits on the board: right at an edge, not near it.
      delegate(el, "click", "[data-pb-at-left], [data-pb-at-center], [data-pb-at-right], [data-pb-at-top], [data-pb-at-full]", (_e, t) => {
        const box = picked();
        const card = box ? cardOf(box.id) : null;
        if (!box || !card) return;
        const d = t.dataset;
        if ("pbAtFull" in d) { box.x = 0; box.w = BOARD_W; box.anc = "s"; }
        else if ("pbAtLeft" in d) { box.x = 0; box.anc = "l"; }
        else if ("pbAtRight" in d) { box.x = BOARD_W - box.w; box.anc = "r"; }
        else if ("pbAtCenter" in d) { box.x = Math.round((BOARD_W - box.w) / 2); box.anc = "c"; }
        else if ("pbAtTop" in d) box.y = 0;
        layout(box);
        grow();
        commit();
        drawOpts();
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
      delegate(el, "change", "[data-pb-label]", () => { commit(); }),
      delegate(el, "change", "[data-pb-target]", (_e, t) => {
        const box = picked();
        if (!box) return;
        box.target = (t as HTMLSelectElement).value;
        refresh(box);
        commit();
      }),

      delegate(el, "click", "[data-pb-pick]", async () => {
        const box = picked();
        if (!box) return;
        const r = await chooseMedia();
        if (!r) return;
        box.url = r.url;
        refresh(box);
        commit();
        drawOpts();
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
        if (/^https?:\/\/\S+$/i.test(v) || /^\/media\/file\//.test(v)) box.url = v; else delete box.url;
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

      // Exact numbers for where a piece is and how big it is.
      delegate(el, "change", "[data-pb-num]", (_e, t) => {
        const box = picked();
        const input = t as HTMLInputElement;
        const key = input.dataset.pbNum;
        if (!box || !key || input.value === "") return;
        const n = Math.round(Number(input.value));
        if (!Number.isFinite(n)) return;
        if (key === "x") box.x = Math.max(0, Math.min(BOARD_W - box.w, n));
        else if (key === "y") box.y = Math.max(0, Math.min(MAX_Y, n));
        else if (key === "w") box.w = Math.max(20, Math.min(3000, n));
        let redraw = false;
        if (key === "h") { redraw = !box.fixedH; box.h = Math.max(16, Math.min(3000, n)); box.fixedH = true; }
        change(box, {});
        layout(box);
        input.value = String(key === "x" ? box.x : key === "y" ? box.y : key === "w" ? box.w : box.h);
        commit();
        // Redrawing the options would throw away the button that is being pressed, so it only happens when it has to.
        if (redraw) drawOpts();
      }),
      // Choices that set one thing: up and down, border line, hover, how it arrives.
      // Shows how the picked piece arrives and moves, since pieces keep still while they are edited.
      delegate(el, "click", "[data-pb-play]", () => {
        const box = picked();
        const card = box ? cardOf(box.id) : null;
        if (!box || !card) return;
        card.classList.remove("pv", "in");
        void card.offsetWidth;
        card.classList.add("pv", "in");
        window.setTimeout(() => card.classList.remove("pv"), (box.animMs ?? 800) + (box.animDelay ?? 0) + 4000);
      }),
      delegate(el, "click", "[data-pb-set]", (_e, t) => {
        const box = picked();
        const [key, value] = (t.dataset.pbSet ?? "").split(":");
        if (!box || !key || !value) return;
        (box as unknown as Record<string, unknown>)[key] = key === "nwt" ? Number(value) : value;
        if (key === "theme" && value === "none") delete box.theme;
        // A line of text starts without a little picture, and a link with one picked from its address.
        if (key === "mode") { if (value === "text" && (!box.icon || box.icon === "auto")) box.icon = "none"; else if (value === "link" && (!box.icon || box.icon === "none")) box.icon = "auto"; }
        change(box, {});
        commit();
        // What an item is, and how a group lays out its items, changes what is drawn.
        if (["mode", "flow", "nfx", "ncase", "handle", "fx", "lmo"].includes(key)) { draw(); watch(); } else drawOpts();
      }),

      // A link or a line of text: its little picture, and which group it is in.
      delegate(el, "change", "[data-pb-icon]", (_e, t) => {
        const box = picked();
        if (!box) return;
        box.icon = (t as HTMLSelectElement).value;
        refresh(box);
        commit();
      }),
      delegate(el, "change", "[data-pb-into]", (_e, t) => {
        const box = picked();
        if (!box) return;
        const to = (t as HTMLSelectElement).value;
        if (to) box.into = to;
        else if (box.into) {
          // Out of its group, the item is put on the board in a free spot.
          delete box.into;
          const sp = findSpot(box.w, box.h);
          box.x = sp.x;
          box.y = sp.y;
        }
        commit();
        draw();
        watch();
      }),
      delegate(el, "click", "[data-pb-item-up], [data-pb-item-down]", (_e, t) => {
        const box = picked();
        if (!box?.into) return;
        const list = boxes();
        const mates = list.filter(b => b.into === box.into);
        const i = mates.indexOf(box);
        const other = mates[i + ("pbItemDown" in t.dataset ? 1 : -1)];
        if (!other) return;
        // The items follow each other in the order of the board's list, so the two swap places in it.
        const a = list.indexOf(box);
        const b = list.indexOf(other);
        [list[a], list[b]] = [list[b]!, list[a]!];
        commit();
        draw();
        watch();
      }),
      delegate(el, "click", "[data-pb-additem]", () => {
        el.querySelector<HTMLElement>('[data-pb-add="item"]')?.click();
      }),
      delegate(el, "change", "[data-pb-flag]", (_e, t) => {
        const box = picked();
        const key = (t as HTMLInputElement).dataset.pbFlag;
        if (!box || !key) return;
        const on = (t as HTMLInputElement).checked;
        const rec = box as unknown as Record<string, unknown>;
        // The dots are on unless they are switched off, so that flag is kept the other way round.
        if (key === "dots") { if (on) delete box.dots; else box.dots = false; }
        else if (on) rec[key] = true; else delete rec[key];
        change(box, {});
        syncFrame();
        commit();
        if (["banner", "noav", "dots", "stag"].includes(key)) { draw(); watch(); }
      }),
      delegate(el, "input", "[data-pb-bgc]", (_e, t) => { const box = picked(); if (box) change(box, { bg: (t as HTMLInputElement).value }); }),
      delegate(el, "change", "[data-pb-bgc]", () => { commit(); drawOpts(); }),
      delegate(el, "click", "[data-pb-bgc-clear]", () => { const box = picked(); if (!box) return; delete box.bg; delete box.bga; change(box, {}); commit(); drawOpts(); }),
      delegate(el, "input", "[data-pb-bcc]", (_e, t) => { const box = picked(); if (box) change(box, { bc: (t as HTMLInputElement).value }); }),
      delegate(el, "change", "[data-pb-bcc]", () => { commit(); drawOpts(); }),
      delegate(el, "click", "[data-pb-bcc-clear]", () => { const box = picked(); if (!box) return; delete box.bc; change(box, {}); commit(); drawOpts(); }),
      // The name of the profile piece, and colours with an address of their own.
      delegate(el, "input", "[data-pb-str-ntext]", (_e, t) => {
        const box = picked();
        if (!box) return;
        const v = (t as HTMLInputElement).value;
        if (v.trim()) box.ntext = v; else delete box.ntext;
        refresh(box);
      }),
      delegate(el, "change", "[data-pb-str-ntext]", commit),
      delegate(el, "input", "[data-pb-col-ncol]", (_e, t) => { const box = picked(); if (box) change(box, { ncol: (t as HTMLInputElement).value }); }),
      delegate(el, "change", "[data-pb-col-ncol]", () => { commit(); drawOpts(); }),
      delegate(el, "click", "[data-pb-col-clear-ncol]", () => { const box = picked(); if (!box) return; delete box.ncol; change(box, {}); commit(); drawOpts(); }),
      delegate(el, "input", "[data-pb-col]", (_e, t) => {
        const box = picked();
        const key = (t as HTMLInputElement).dataset.pbCol;
        if (box && (key === "tc1" || key === "tc2")) change(box, { [key]: (t as HTMLInputElement).value } as Partial<BoardBox>);
      }),
      delegate(el, "change", "[data-pb-col]", commit),

      // Games and music lists: find a cover, add, change and put in order.
      delegate(el, "input", "[data-pb-find]", (_e, t) => { findQ = (t as HTMLInputElement).value; }),
      delegate(el, "keydown", "[data-pb-find]", (e) => { if ((e as KeyboardEvent).key === "Enter") { e.preventDefault(); void doFind(); } }),
      delegate(el, "click", "[data-pb-find-go]", () => { void doFind(); }),
      delegate(el, "click", "[data-pb-find-cancel]", () => { findIdx = null; findQ = ""; hits = []; hitNote = ""; drawOpts(); }),
      delegate(el, "click", "[data-pb-hit]", async (_e, t) => {
        const box = picked();
        const hit = hits[Number(t.dataset.pbHit)];
        if (!box || !hit) return;
        const items = box.items ?? (box.items = []);
        if (findIdx === null && items.length >= MAX_LIST) { toast("That list is full."); return; }
        toast("Saving the cover…");
        let cover: string | undefined;
        try { cover = (await api.saveCover(hit.cover)).url; } catch (e) { toast(e instanceof Error ? e.message : "The cover could not be saved."); }
        if (findIdx !== null && items[findIdx]) { if (cover) items[findIdx]!.c = cover; }
        else items.push({ n: hit.name, ...(kindOf(box.id) === "listen" && hit.sub ? { s: hit.sub.split(" · ")[0]! } : {}), ...(cover ? { c: cover } : {}) });
        hits = []; hitNote = ""; findIdx = null; findQ = "";
        commit();
        draw();
        watch();
      }),
      delegate(el, "click", "[data-pb-li-blank]", () => {
        const box = picked();
        if (!box) return;
        (box.items ??= []).push({ n: kindOf(box.id) === "games" ? "New game" : "New song" });
        commit(); draw(); watch();
      }),
      delegate(el, "input", "[data-pb-li]", (_e, t) => {
        const box = picked();
        const [i, key] = ((t as HTMLInputElement).dataset.pbLi ?? "").split(":");
        const it = box?.items?.[Number(i)];
        if (!box || !it || (key !== "n" && key !== "s" && key !== "c")) return;
        const v = (t as HTMLInputElement).value;
        if (key === "n") it.n = v; else if (v.trim()) it[key] = v.trim(); else delete it[key];
        refresh(box);
      }),
      delegate(el, "change", "[data-pb-li]", () => { commit(); drawOpts(); }),
      delegate(el, "click", "[data-pb-li-find]", (_e, t) => {
        const box = picked();
        const i = Number(t.dataset.pbLiFind);
        if (!box?.items?.[i]) return;
        findIdx = i; findQ = box.items[i]!.n; hits = []; hitNote = "";
        void doFind();
      }),
      delegate(el, "click", "[data-pb-li-file]", async (_e, t) => {
        const box = picked();
        const it = box?.items?.[Number(t.dataset.pbLiFile)];
        if (!box || !it) return;
        const r = await chooseMedia();
        if (!r || r.video) { if (r?.video) toast("Use a picture for a cover."); return; }
        it.c = r.url;
        commit(); draw(); watch();
      }),
      delegate(el, "click", "[data-pb-li-up], [data-pb-li-down], [data-pb-li-del]", (_e, t) => {
        const box = picked();
        const items = box?.items;
        if (!box || !items) return;
        const d = t.dataset;
        const i = Number(d.pbLiUp ?? d.pbLiDown ?? d.pbLiDel);
        if (!items[i]) return;
        if ("pbLiDel" in d) items.splice(i, 1);
        else { const j = i + ("pbLiDown" in d ? 1 : -1); if (!items[j]) return; [items[i], items[j]] = [items[j]!, items[i]!]; }
        commit(); draw(); watch();
      }),
      delegate(el, "click", "[data-pb-copy]", () => {
        const box = picked();
        if (!box) return;
        const list = boxes();
        if (list.length >= MAX_PIECES) { toast("That is the most pieces a board can hold."); return; }
        const kind = kindOf(box.id);
        let n = 2;
        while (list.some(b => b.id === `${kind}:${n}`)) n++;
        const copy: BoardBox = { ...box, id: `${kind}:${n}`, x: Math.min(BOARD_W - box.w, box.x + 24), y: box.y + 24 };
        list.push(copy);
        selected = copy.id;
        commit();
        draw();
        watch();
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
        const spot = centreSpot(spec.w, spec.h);
        closeMenus();
        if (kind === "page") {
          // The next page starts below everything that is already there.
          const bottom = list.filter(b => !isChild(b)).reduce((m, b) => { const c = cardOf(b.id); return Math.max(m, b.y + (c ? c.offsetHeight : b.h)); }, 0);
          const y = Math.ceil((bottom + 80) / GRID) * GRID;
          box = { id, x: 40, y, w: 1120, h: spec.h, fixedH: true, fill: "soft", label: `Page ${list.filter(b => kindOf(b.id) === "page").length + 2}` };
        } else if (kind === "jump") {
          const firstPage = list.find(b => kindOf(b.id) === "page");
          box = { id, x: spot.x, anc: "c", y: spot.y, w: spec.w, h: spec.h, fill: "outline", label: "Scroll down", target: firstPage?.id ?? "top" };
        } else if (kind === "rail") {
          box = { id, x: BOARD_W - spec.w - 16, y: 120, w: spec.w, h: spec.h, fill: "none", dock: "right", look: "bar" };
        } else if (kind === "item") {
          // With a group (or an item in one) picked, the new item goes into that group.
          const cur = picked();
          const home = cur && kindOf(cur.id) === "group" ? cur.id : cur?.into;
          box = { id, x: spot.x, anc: "c", y: spot.y, w: spec.w, h: spec.h, fill: "soft", mode: "link", label: "My link", icon: "auto" };
          if (home && list.some(g => g.id === home)) box.into = home;
        } else if (kind === "group") {
          box = { id, x: spot.x, anc: "c", y: spot.y, w: spec.w, h: spec.h, fill: "none", flow: "col", gap: 10 };
        } else if (kind === "text") {
          box = { id, x: spot.x, anc: "c", y: spot.y, w: spec.w, h: spec.h, fill: "soft", label: "A heading", text: "Write something here." };
        } else if (kind === "image") {
          box = { id, x: spot.x, anc: "c", y: spot.y, w: spec.w, h: spec.h, fixedH: true, fill: "none", pad: 0, look: "cover" };
        } else {
          box = { id, x: spot.x, anc: "c", y: spot.y, w: spec.w, h: spec.h, fill: "none", size: 2 };
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
        // The items of a group that is removed are put back on the board, one under the other.
        if (kindOf(box.id) === "group") {
          for (const kid of list.filter(b => b.into === box.id)) { delete kid.into; const sp = findSpot(kid.w, kid.h); kid.x = sp.x; kid.y = sp.y; }
        }
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
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("resize", onWinResize);
      if (full) setFull(false);
      offs.forEach(fn => fn());
      detachMoves();
      listsOff?.();
      for (const fn of cleanups.splice(0)) fn();
    };
  },
};
