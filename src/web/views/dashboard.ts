import { api } from "../api";
import { loadLayout, resetNav, saveLayout } from "../layout";
import { Stage } from "../render/stage";
import { navigate } from "../router";
import { store, type SaveState } from "../state";
import { MARK_SVG } from "../ui/chrome";
import { makeSortable } from "../ui/drag";
import { mountPalette, type Command } from "../ui/palette";
import { toast } from "../ui/toast";
import { esc, must } from "../util/dom";
import { railIcon } from "./icons";
import { boardPane } from "./panes/board";
import { discordPane } from "./panes/discord";
import { extrasPane } from "./panes/extras";
import type { Pane } from "./panes/fields";
import { groupsPane } from "./panes/groups";
import { insightsPane } from "./panes/insights";
import { linksPane } from "./panes/links";
import { musicPane } from "./panes/music";
import { pageboardPane } from "./panes/pageboard";
import { profilePane } from "./panes/profile";
import { sharePane } from "./panes/share";
import { stylePane } from "./panes/style";
import { rolesPane } from "./panes/roles";

const PANES: Pane[] = [profilePane, linksPane, groupsPane, rolesPane, stylePane, musicPane, discordPane, extrasPane, pageboardPane, insightsPane, sharePane, boardPane];

/** The sections the panes belong to. The rail shows them as a tag on each row. */
const SECTIONS: ReadonlyArray<{ label: string; ids: string[] }> = [
  { label: "Your page", ids: ["profile", "links", "groups"] },
  { label: "Look", ids: ["style"] },
  { label: "Extras", ids: ["music", "discord", "roles"] },
  { label: "Settings", ids: ["page", "pageboard"] },
  { label: "Measure", ids: ["insights", "share"] },
  { label: "Experimental", ids: ["board"] },
];

const SECTION_OF: Record<string, string> = Object.fromEntries(
  SECTIONS.flatMap(s => s.ids.map(id => [id, s.label] as const)),
);

/** The rail, in the order it starts out. */
const DEFAULT_NAV: readonly string[] = SECTIONS.flatMap(s => s.ids);

/** The grip you hold to reorder the rail. */
const GRIP = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`;

const SAVE_TEXT: Record<SaveState, string> = { idle: "", saving: "Saving…", saved: "Saved", error: "Couldn't save" };

/** The editor: a labelled sidebar, the form in the middle, a live preview on the right. */
export function mountDashboard(root: HTMLElement): () => void {
  const me = store.me;
  if (!me) { navigate("/", true); return () => {}; }

  let active = PANES[0]!;
  // The pane can be named in the address (#groups), which makes a link to one part of the editor.
  // A section that is for VIP members is not opened for a regular member, whichever way it
  // is asked for.
  const fromHash = (): Pane | undefined => {
    const pane = PANES.find(p => p.id === location.hash.slice(1));
    return pane && pane.vip && !me.vip ? undefined : pane;
  };
  try { active = PANES.find(p => p.id === sessionStorage.getItem("dusk.tab")) ?? active; } catch { /* storage unavailable */ }
  if (active.vip && !me.vip) active = PANES[0]!;
  active = fromHash() ?? active;

  // How the editor is arranged: the order of the rail, the board, and the preview's side.
  const lay = loadLayout(me.user.username, DEFAULT_NAV);

  // The sections of the rail that are open. The one holding the open section starts open.
  const openSecs = new Set<string>([SECTION_OF[active.id] ?? ""]);

  /** Is this section open? */
  const isOpen = (label: string): boolean => openSecs.has(label);

  /**
   * The rail: the sections, each one a drop-down that holds its sections.
   *
   * A section that is not open is not shown at all, so the rail is a short list of names
   * rather than twelve rows. A section that is for VIP members is locked, so a regular
   * member can see that it exists.
   */
  const navHTML = (): string => SECTIONS.map(sec => {
    const ids = lay.nav.filter(id => sec.ids.includes(id));
    if (!ids.length) return "";
    const rows = ids
      .map(id => PANES.find(p => p.id === id))
      .filter((p): p is Pane => Boolean(p))
      .map(p => {
        const locked = Boolean(p.vip) && !me.vip;
        return `<button class="tab${locked ? " locked" : ""}" type="button" role="tab" data-tab="${p.id}" data-sort-item aria-selected="${p.id === active.id}"${locked ? ' aria-disabled="true"' : ""}>
          <span class="tab-grip" data-sort-handle aria-hidden="true">${GRIP}</span>
          <span class="tab-ic">${railIcon(p.id)}</span>
          <span class="tab-text"><span class="tab-label">${esc(p.label)}</span></span>
          ${locked ? '<b class="vip-mini">VIP</b>' : ""}
        </button>`;
      }).join("");
    const open = isOpen(sec.label);
    return `<div class="nav-sec" data-sec="${esc(sec.label)}">
      <button class="nav-sec-h" type="button" data-sec-head aria-expanded="${open}" aria-controls="sec-${esc(sec.label).replace(/\W+/g, "-").toLowerCase()}">
        <span class="nav-sec-name">${esc(sec.label)}</span>
        <span class="nav-sec-count">${ids.length}</span>
        <i class="nav-sec-caret" aria-hidden="true"></i>
      </button>
      <div class="nav-sec-list" id="sec-${esc(sec.label).replace(/\W+/g, "-").toLowerCase()}" data-sort-list${open ? "" : " hidden"}>${rows}</div>
    </div>`;
  }).join("");

  root.innerHTML = `<div class="dash" data-pane="edit" data-wide="false">
    <header class="dash-top">
      <a class="mark" href="/" data-link aria-label="dusk">${MARK_SVG}<b>dusk</b></a>
      <span class="url-chip" id="chip"></span>
      <button class="cmdk" type="button" id="cmdk" aria-label="Open the command palette">
        <span>Jump to</span><kbd>⌘K</kbd></button>
      <div class="seg mobile-switch" role="group" aria-label="Editor or preview">
        <button type="button" data-pane-btn="edit" aria-pressed="true">Edit</button>
        <button type="button" data-pane-btn="preview" aria-pressed="false">Preview</button>
      </div>
      <div class="top-r">
        ${me.vip ? '<span class="vip-chip" title="You are a VIP member">VIP</span>' : ""}
        <span class="saved" id="saved" role="status"></span>
        <a class="btn-ghost" href="/community" data-link>Community</a>
        <a class="btn-ghost" id="view" href="#" data-link>View page</a>
        <button class="btn-text" type="button" id="logout">Log out</button>
      </div>
    </header>
    <div class="dash-body" id="dash-body" data-side="${lay.previewSide}">
      <nav class="dash-nav" aria-label="Editor sections">
        <div class="nav-list" id="nav-list" role="tablist" aria-orientation="vertical" data-sort-list>${navHTML()}</div>
        <button class="nav-reset" type="button" id="nav-reset" title="Put the sections back in order">Reset the order</button>
      </nav>
      <aside class="side">
        <div class="side-head">
          <h2 class="side-title" id="side-title"></h2>
          <p class="side-hint" id="side-hint"></p>
        </div>
        <div class="side-body" id="pane"></div>
      </aside>
      <section class="preview-pane">
        <div class="pv-bar">
          <span class="pv-grip" id="pv-grip" title="Drag the preview to the other side" aria-label="Move the preview to the other side">${GRIP}</span>
          <span>Live preview</span>
          <div class="seg dev" role="group" aria-label="Preview size"><button type="button" data-dev="desktop" aria-pressed="true">Desktop</button><button type="button" data-dev="mobile" aria-pressed="false">Phone</button></div>
        </div>
        <div class="frame" id="frame"></div>
      </section>
      <section class="board-pane" id="board"></section>
    </div>
  </div>`;

  const dash = must(".dash", root);
  const body = must("#dash-body", root);
  const paneEl = must("#pane", root);
  const boardEl = must("#board", root);
  const navList = must("#nav-list", root);
  const frame = must("#frame", root);
  const saved = must("#saved", root);
  const chip = must("#chip", root);
  const view = must<HTMLAnchorElement>("#view", root);

  const stage = new Stage(store.model!);
  frame.append(stage.el);

  /** Show the sections that are open, and hide the ones that are not. */
  const syncSecs = (): void => {
    for (const sec of navList.querySelectorAll<HTMLElement>(".nav-sec")) {
      const open = isOpen(sec.dataset.sec ?? "");
      const list = sec.querySelector<HTMLElement>(".nav-sec-list");
      if (list) list.hidden = !open;
      sec.querySelector<HTMLElement>("[data-sec-head]")?.setAttribute("aria-expanded", String(open));
    }
  };

  let unmountPane: () => void = () => {};
  const openPane = (pane: Pane): void => {
    // A section that is for VIP members is not opened for a regular member.
    if (pane.vip && !me.vip) {
      toast("This one is for VIP members.");
      return;
    }
    unmountPane();
    active = pane;
    // The section holding it opens, so the rail shows where you are.
    const label = SECTION_OF[pane.id];
    if (label) {
      openSecs.add(label);
      syncSecs();
    }
    try { sessionStorage.setItem("dusk.tab", pane.id); } catch { /* storage unavailable */ }
    if (fromHash() !== pane) history.replaceState(null, "", `#${pane.id}`);
    root.querySelectorAll<HTMLElement>("[data-tab]").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === pane.id)));
    must("#side-title", root).textContent = pane.label;
    must("#side-hint", root).textContent = pane.hint ?? "";
    // A wide pane takes the whole editor, so the form and the preview step aside.
    dash.dataset.wide = String(Boolean(pane.wide));
    const target = pane.wide ? boardEl : paneEl;
    target.scrollTop = 0;
    unmountPane = pane.mount(target);
  };
  openPane(active);

  const setDevice = (kind: string): void => {
    frame.classList.toggle("mobile", kind === "mobile");
    root.querySelectorAll<HTMLElement>("[data-dev]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.dev === kind)));
  };

  const refreshLinks = (): void => {
    const name = store.me?.user.username ?? "";
    chip.innerHTML = `${esc(location.host)}/<b>${esc(name)}</b>`;
    view.href = `/${encodeURIComponent(name)}`;
  };
  refreshLinks();

  /* The rail can be dragged into a new order, and the order is remembered. */
  const readNav = (): void => {
    lay.nav = [...navList.querySelectorAll<HTMLElement>("[data-tab]")].map(t => t.dataset.tab ?? "").filter(Boolean);
    saveLayout();
  };
  const offSort = makeSortable(navList, readNav);

  must("#nav-reset", root).addEventListener("click", () => {
    resetNav(DEFAULT_NAV);
    navList.innerHTML = navHTML();
    root.querySelectorAll<HTMLElement>("[data-tab]").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === active.id)));
  });

  /* The preview can be dragged to the other side of the form. */
  const grip = must("#pv-grip", root);
  let sidePointer = -1;
  let sideStartX = 0;
  grip.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    sidePointer = e.pointerId;
    sideStartX = e.clientX;
    grip.setPointerCapture(e.pointerId);
    body.classList.add("siding");
    e.preventDefault();
  });
  grip.addEventListener("pointermove", e => {
    if (e.pointerId !== sidePointer) return;
    const r = body.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    // The grip sits at the edge of the preview, so where it was grabbed says which way
    // the drag means. Cross the middle and the preview swaps over.
    const side = sideStartX < mid
      ? (e.clientX > mid ? "right" : "left")
      : (e.clientX < mid ? "left" : "right");
    if (body.dataset.side !== side) {
      body.dataset.side = side;
      lay.previewSide = side;
      saveLayout();
    }
  });
  const endSide = (e: PointerEvent): void => {
    if (e.pointerId !== sidePointer) return;
    sidePointer = -1;
    body.classList.remove("siding");
    grip.releasePointerCapture?.(e.pointerId);
  };
  grip.addEventListener("pointerup", endSide);
  grip.addEventListener("pointercancel", endSide);

  const logout = (): void => {
    void store.flush()
      .then(() => api.logout())
      .catch(() => { /* leaving anyway */ })
      .then(() => { store.setMe(null); navigate("/"); });
  };

  /* The command palette: every section, plus a few things you can do. */
  const commands = (): Command[] => [
    ...PANES.map(p => ({
      id: p.id,
      label: p.label,
      hint: p.vip && !me.vip ? "VIP only" : "Section",
      group: "Jump to",
      run: () => openPane(p),
    })),
    { id: "dev-desktop", label: "Preview on a desktop", group: "Preview", run: () => setDevice("desktop") },
    { id: "dev-mobile", label: "Preview on a phone", group: "Preview", run: () => setDevice("mobile") },
    { id: "side-left", label: "Move the preview to the left", group: "Preview", run: () => { body.dataset.side = "left"; lay.previewSide = "left"; saveLayout(); } },
    { id: "side-right", label: "Move the preview to the right", group: "Preview", run: () => { body.dataset.side = "right"; lay.previewSide = "right"; saveLayout(); } },
    { id: "view", label: "Open my page", group: "Page", run: () => { location.href = `/${encodeURIComponent(store.me?.user.username ?? "")}`; } },
    { id: "copy", label: "Copy my page address", group: "Page", run: () => { void navigator.clipboard?.writeText(`${location.origin}/${encodeURIComponent(store.me?.user.username ?? "")}`); } },
    { id: "community", label: "Go to the community page", group: "Page", run: () => navigate("/community") },
    { id: "logout", label: "Log out", group: "Account", run: () => logout() },
  ];
  const palette = mountPalette(commands);
  must("#cmdk", root).addEventListener("click", () => palette.open());
  const onKey = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); palette.open(); }
  };
  document.addEventListener("keydown", onKey);
  const onHash = (): void => { const p = fromHash(); if (p && p !== active) openPane(p); };
  window.addEventListener("hashchange", onHash);

  let lastSave = store.saveState;
  const off = store.subscribe(() => {
    if (store.saveState !== lastSave) {
      lastSave = store.saveState;
      saved.textContent = SAVE_TEXT[lastSave];
      return;
    }
    const model = store.model;
    if (model) stage.update(model);
    refreshLinks();
  });

  const click = (e: Event): void => {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest(".tab-grip")) return;
    // A section of the rail opens and closes.
    const head = t?.closest<HTMLElement>("[data-sec-head]");
    if (head) {
      const sec = head.closest<HTMLElement>(".nav-sec");
      const list = sec?.querySelector<HTMLElement>(".nav-sec-list");
      if (!list) return;
      const open = list.hidden;
      list.hidden = !open;
      head.setAttribute("aria-expanded", String(open));
      const label = sec?.dataset.sec ?? "";
      if (open) openSecs.add(label); else openSecs.delete(label);
      return;
    }
    const tab = t?.closest<HTMLElement>("[data-tab]");
    if (tab) {
      const p = PANES.find(x => x.id === tab.dataset.tab);
      if (!p) return;
      // A section that is for VIP members says so rather than opening.
      if (p.vip && !me.vip) { toast("This one is for VIP members."); return; }
      if (p !== active) openPane(p);
      return;
    }
    const dev = t?.closest<HTMLElement>("[data-dev]");
    if (dev) { setDevice(dev.dataset.dev ?? "desktop"); return; }
    const pn = t?.closest<HTMLElement>("[data-pane-btn]");
    if (pn) {
      dash.dataset.pane = pn.dataset.paneBtn ?? "edit";
      root.querySelectorAll<HTMLElement>("[data-pane-btn]").forEach(b => b.setAttribute("aria-pressed", String(b === pn)));
      return;
    }
    if (t?.closest("#logout")) logout();
  };
  root.addEventListener("click", click);

  return () => {
    root.removeEventListener("click", click);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("hashchange", onHash);
    off();
    offSort();
    unmountPane();
    stage.destroy();
    void store.flush();
  };
}
