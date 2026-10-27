import { BOARD_H, BOARD_W, defaultBoard, kindOf, knownPiece, PAGE_KINDS, PAGE_WIDGETS, PIECE_THEMES } from "../../shared/constants";
import type { BoardBox, RenderModel } from "../../shared/types";
import { brandForUrl } from "../../shared/brands";
import { isVideoUrl, safeUrl } from "../../shared/url";
import { icon } from "../ui/icons";
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
    case "item": return itemHTML(box);
    case "group": return groupHTML(box, m);
    case "rail": return railHTML(m.profile.page.board, box);
    case "text": return `<div class="ftext">${box?.label ? `<h3>${esc(box.label)}</h3>` : ""}${box?.text ? `<p>${esc(box.text).replace(/\n/g, "<br>")}</p>` : ""}${box?.label || box?.text ? "" : `<p class="ftext-empty">Write something</p>`}</div>`;
    case "image": return box?.url && isVideoUrl(box.url) ? `<video class="fimg" src="${esc(box.url)}" aria-label="${esc(box.label ?? "")}" autoplay muted loop playsinline preload="metadata"></video>` : box?.url ? `<img class="fimg" src="${esc(box.url)}" alt="${esc(box.label ?? "")}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : `<div class="fimg-empty">Add a picture or video address, or choose a file</div>`;
    case "divider": return `<hr class="fdiv">`;
    case "page": return `<div class="fpage-in">${pageTitle(box)}</div>`;
    case "jump": return `<span class="fjump" role="button" tabindex="0" data-dir="${jumpUp(m.profile.page.board, box) ? "up" : "down"}" data-jump="${esc(box?.target ?? "top")}"><span>${esc(box?.label || "Scroll down")}</span><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg></span>`;
    case "profile": {
      const banner = bannerHTML(m, box);
      return `<div class="fhead"${banner ? " data-banner" : ""}>${banner}${shareHTML(m)}${headHTML(m, box)}</div>`;
    }
    case "games":
    case "listen": return listHTML(box, kindOf(id));
    case "links": return linksHTML(m.profile);
    case "lyrics": return `<div class="pslot" data-slot="lyrics"></div>`;
    case "music": return `<div class="pslot" data-slot="music"></div>`;
    case "discord": return `<div class="pslot" data-slot="discord"></div>`;
    case "views": return viewsHTML(m);
    default: return "";
  }
}

/** The Discord banner at the top of the profile piece, if the piece shows it and there is one to show. */
function bannerHTML(m: RenderModel, box?: BoardBox): string {
  if (!box?.banner) return "";
  if (m.discordBannerUrl) return `<div class="pbanner" style="background-image:url(${esc(m.discordBannerUrl)})"></div>`;
  if (m.discordAccent && /^#[0-9a-f]{6}$/i.test(m.discordAccent)) return `<div class="pbanner" style="background:linear-gradient(135deg,${m.discordAccent},color-mix(in srgb,${m.discordAccent} 45%,#000))"></div>`;
  return "";
}

/** A games or music list: tall covers in a row that slides sideways, with a dot for each screenful. */
function listHTML(box: BoardBox | undefined, kind: string): string {
  const items = box?.items ?? [];
  if (!items.length) return `<div class="flist-empty">${kind === "games" ? "Add the games you play" : "Add the music you listen to"}</div>`;
  const cards = items.map(it => {
    const letter = esc((it.n.trim().charAt(0) || "?").toUpperCase());
    const art = it.c ? `<span class="fcard-img" style="background-image:url(${esc(it.c)})"></span>` : "";
    return `<figure class="fcard" role="listitem"><div class="fcard-art"><span class="fcard-ph">${letter}</span>${art}</div><figcaption><b>${esc(it.n)}</b>${it.s ? `<small>${esc(it.s)}</small>` : ""}</figcaption></figure>`;
  }).join("");
  return `<div class="flist" data-list="${kind}"${box?.dots === false ? ' data-nodots="1"' : ""}><div class="flist-track" role="list">${cards}</div><div class="flist-dots" aria-hidden="true"></div></div>`;
}

/** The effect that plays over a piece: a set of small shapes, each with its own place, size and timing, so it looks the same every time. */
export function fxHTML(b?: BoardBox): string {
  const kind = b?.fx;
  if (!b || !kind || kind === "none") return "";
  let seed = 0;
  for (const ch of `${b.id}${kind}`) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const n = Math.max(5, Math.min(80, b.fxn ?? 30));
  let out = "";
  for (let i = 0; i < n; i++) {
    const size = kind === "rain" ? 1 + rnd() : kind === "stars" ? 1 + rnd() * 2 : kind === "bubbles" ? 6 + rnd() * 16 : 3 + rnd() * 7;
    const dur = kind === "rain" ? 0.7 + rnd() * 0.8 : kind === "stars" || kind === "sparkles" ? 1.6 + rnd() * 2.4 : 5 + rnd() * 7;
    out += `<i style="--l:${(rnd() * 100).toFixed(1)}%;--tp:${(rnd() * 100).toFixed(1)}%;--s:${size.toFixed(1)}px;--t:${dur.toFixed(2)}s;--d:${(-rnd() * dur).toFixed(2)}s;--o:${(0.4 + rnd() * 0.6).toFixed(2)};--dx:${(rnd() * 40 - 20).toFixed(0)}px;--h:${Math.round(rnd() * 360)}"></i>`;
  }
  return `<div class="pfx" data-fx="${kind}" aria-hidden="true">${out}</div>`;
}

/** The two colours of a piece's theme, if it has one. */
export function themeOf(b: BoardBox): [string, string] | null {
  if (!b.theme) return null;
  if (b.theme === "custom") return [b.tc1 ?? "#7c3aed", b.tc2 ?? "#db2777"];
  const t = PIECE_THEMES[b.theme];
  return t ? [t[0], t[1]] : null;
}

/** Whether a button sends you up the page: its page is above the button. */
function jumpUp(board: readonly BoardBox[], box?: BoardBox): boolean {
  if (!box) return false;
  const target = box.target ?? "top";
  const y = target === "top" ? 0 : board.find(b => b.id === target)?.y ?? 0;
  return y < box.y;
}

/** A link or a line of text, as its owner set it. */
function itemHTML(box?: BoardBox): string {
  const mode = box?.mode ?? "link";
  const href = box?.url ? safeUrl(box.url) : "";
  const label = box?.label?.trim() ?? "";
  const kind = box?.icon ?? (mode === "link" ? "auto" : "none");
  const ic = kind === "none" ? "" : icon(kind === "auto" ? (brandForUrl(href) ?? "link") : (kind as never));
  const shown = label || (mode === "link" ? href.replace(/^https?:\/\//, "") : "");
  const words = `<span class="t"><b${shown ? "" : ' class="fitem-empty"'}>${esc(shown || "Write something")}</b>${box?.text ? `<small>${esc(box.text)}</small>` : ""}</span>`;
  const arrow = mode === "link" ? `<span class="arr">${icon("arrow")}</span>` : "";
  const cls = `fitem${mode === "text" ? " is-text" : ""}`;
  return href
    ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${ic}${words}${arrow}</a>`
    : `<span class="${cls}">${ic}${words}${arrow}</span>`;
}

/** The items that sit in a group. */
export function itemsOf(board: readonly BoardBox[], group: BoardBox): BoardBox[] {
  return board.filter(b => b.into === group.id);
}

/** A group: the items put into it, laid out in a row, a column or a grid. */
function groupHTML(box: BoardBox | undefined, m: RenderModel): string {
  if (!box) return "";
  const kids = itemsOf(m.profile.page.board, box);
  const title = box.label ? `<h3 class="fgroup-t">${esc(box.label)}</h3>` : "";
  const gap = typeof box.gap === "number" ? ` style="--gap:${box.gap}px"` : "";
  const body = kids.length ? kids.map(k => boxHTML(k, widgetHTML(k.id, m, k), true)).join("") : `<span class="fgroup-empty"></span>`;
  return `<div class="fgroup" data-flow="${box.flow ?? "col"}"${gap}>${title}${body}</div>`;
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
  return (kind === "page" || kind === "jump" || kind === "group" || kind === "item") && box.label ? `${base}: ${box.label}` : base;
}

/** The boxes to draw: the ones the owner set, or a tidy page if there are none. */
export function pageBoxes(boxes: readonly BoardBox[] | undefined): BoardBox[] {
  const list = (boxes ?? []).filter(b => knownPiece(b.id));
  return list.length ? list : defaultBoard();
}

/** The inside of a piece. */
export function boxInner(body: string, box?: BoardBox): string {
  return `<div class="fbox-in">${body}</div>${fxHTML(box)}`;
}

/** One box of the board, with its place and size in CSS variables. */
export function boxHTML(b: BoardBox, body: string, child = false): string {
  return `<div class="fbox${child ? " fgi" : ""}" data-widget="${esc(b.id)}" data-kind="${esc(kindOf(b.id))}" ${boxAttrs(b)} style="${boxVars(b)}">${boxInner(body, b)}</div>`;
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
  if (themeOf(b)) bits.push(`data-theme="${esc(b.theme ?? "")}"`);
  if (b.locked) bits.push(`data-locked="1"`);
  if (b.glow) bits.push(`data-glowp="1"`);
  if (b.hover && b.hover !== "none") bits.push(`data-hover="${esc(b.hover)}"`);
  if (b.anim && b.anim !== "none") bits.push(`data-anim="${esc(b.anim)}"`);
  if (b.anim && b.anim !== "none" && b.animOn === "view") bits.push(`data-on="view"`);
  const loop = loopOf(b);
  if (loop) bits.push(`data-loop="${loop}"`);
  if (b.par) bits.push(`data-par="${b.par}"`);
  if (b.hideMobile) bits.push(`data-hm="1"`);
  return bits.join(" ");
}

/** The movement a piece keeps doing. The old floating switch counts as the float movement. */
export function loopOf(b: BoardBox): string | undefined {
  const l = b.loop && b.loop !== "none" ? b.loop : b.loop === "none" ? undefined : b.float ? "float" : undefined;
  return l;
}

/** How long and how late a piece arrives, and how fast it moves. The movement waits for the arrival to finish. */
export function motionVars(b: BoardBox): string[] {
  const bits: string[] = [];
  const arrives = Boolean(b.anim && b.anim !== "none");
  if (arrives) {
    bits.push(`--ad:${b.animMs ?? 800}ms`);
    bits.push(`--adl:${b.animDelay ?? 0}ms`);
  }
  if (loopOf(b)) {
    if (typeof b.loopMs === "number") bits.push(`--lp:${b.loopMs}ms`);
    bits.push(`--ld:${arrives ? (b.animMs ?? 800) + (b.animDelay ?? 0) : 0}ms`);
  }
  return bits;
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
  flag("theme", themeOf(b) ? b.theme : undefined);
  flag("hover", b.hover && b.hover !== "none" ? b.hover : undefined);
  flag("anim", b.anim && b.anim !== "none" ? b.anim : undefined);
  flag("on", b.anim && b.anim !== "none" && b.animOn === "view" ? "view" : undefined);
  flag("loop", loopOf(b));
  flag("par", b.par ? String(b.par) : undefined);
  for (const name of ["--ad", "--adl", "--lp", "--ld"]) el.style.removeProperty(name);
  for (const bit of motionVars(b)) { const [k, v] = bit.split(":"); el.style.setProperty(k!, v!); }
  flag("hm", b.hideMobile ? "1" : undefined);
  set("--pb", b.bg ?? null);
  set("--pba", typeof b.bga === "number" ? `${b.bga}%` : null);
  set("--bs", b.bstyle ?? null);
  set("--bc", b.bc ?? null);
  set("--gl", typeof b.glow === "number" ? String(b.glow) : null);
  set("--rot", typeof b.rot === "number" ? `${b.rot}deg` : null);
  set("--zm", typeof b.zoom === "number" ? String(b.zoom / 100) : null);
  for (const bit of lookVars(b)) { const [k, v] = bit.split(/:(.*)/s); el.style.setProperty(k!, v!); }
  for (const name of ["--name-size", "--name-weight", "--p-track", "--name-color", "--av", "--bnh", "--t1", "--t2", "--tha", "--cw"]) if (!lookVars(b).some(v => v.startsWith(`${name}:`))) el.style.removeProperty(name);
}

/** The settings of a piece that become CSS variables: its name, picture, theme and list cards. */
export function lookVars(b: BoardBox): string[] {
  const bits: string[] = [];
  if (typeof b.nsz === "number") bits.push(`--name-size:${b.nsz}px`);
  if (typeof b.nwt === "number") bits.push(`--name-weight:${b.nwt}`);
  if (typeof b.ntr === "number") bits.push(`--p-track:${b.ntr}`);
  if (b.ncol) bits.push(`--name-color:${b.ncol}`);
  if (typeof b.avs === "number") bits.push(`--av:${b.avs}px`);
  if (typeof b.bnh === "number") bits.push(`--bnh:${b.bnh}px`);
  if (typeof b.cardW === "number") bits.push(`--cw:${b.cardW}px`);
  const t = themeOf(b);
  if (t) { bits.push(`--t1:${t[0]}`, `--t2:${t[1]}`, `--tha:${b.tha ?? 38}%`); }
  return bits;
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
  if (b.anc) bits.push(`--anc:${b.anc}`);
  bits.push(...lookVars(b));
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
  bits.push(...motionVars(b));
  return bits.join(";");
}

/** The free-form page, ready to be dropped into the stage. */
export function freeHTML(m: RenderModel, boxes: readonly BoardBox[] | undefined): string {
  const list = pageBoxes(boxes);
  const groups = new Set(list.filter(b => kindOf(b.id) === "group").map(b => b.id));
  const parts = list.map(b => {
    // An item in a group is drawn inside the group.
    if (b.into && groups.has(b.id === b.into ? "" : b.into)) return "";
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
  for (const box of canvas.querySelectorAll<HTMLElement>(":scope > .fbox")) {
    bottom = Math.max(bottom, box.offsetTop + box.offsetHeight);
  }
  return Math.max(least, Math.ceil(bottom + 40));
}

/**
 * Where a piece goes when the board is wider than it was made: pieces on the left stay left, pieces on the
 * right stay right and the ones in the middle stay in the middle. A piece that spans the board stretches.
 */
export function anchorShift(x: number, w: number, extra: number, anc?: string): { ex: number; ew: number } {
  if (extra <= 0) return { ex: 0, ew: 0 };
  // The side the owner put the piece on is used as it is.
  if (anc === "s") return { ex: 0, ew: extra };
  if (anc === "l") return { ex: 0, ew: 0 };
  if (anc === "c") return { ex: extra / 2, ew: 0 };
  if (anc === "r") return { ex: extra, ew: 0 };
  // Boards saved before that are read the old way, by where the piece sits.
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
    const boxes = [...canvas.querySelectorAll<HTMLElement>(":scope > .fbox")];
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
  for (const b of canvas.querySelectorAll<HTMLElement>(":scope > .fbox")) {
    const x = parseFloat(b.style.getPropertyValue("--x")) || 0;
    const w = parseFloat(b.style.getPropertyValue("--w")) || 0;
    const { ex, ew } = anchorShift(x, w, extra, b.style.getPropertyValue("--anc").trim());
    b.style.setProperty("--ex", `${ex}px`);
    b.style.setProperty("--ew", `${ew}px`);
  }
  const h = boardHeight(canvas);
  canvas.style.height = `${h}px`;
  canvas.style.transform = `scale(${k})`;
  canvas.dataset.k = String(k);
  scale.style.width = `${Math.round(bw * k)}px`;
  scale.style.height = `${Math.round(h * k)}px`;
}
