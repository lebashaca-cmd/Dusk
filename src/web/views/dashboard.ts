import { api } from "../api";
import { Stage } from "../render/stage";
import { navigate } from "../router";
import { store, type SaveState } from "../state";
import { esc, must } from "../util/dom";
import { railIcon } from "./icons";
import { discordPane } from "./panes/discord";
import { extrasPane } from "./panes/extras";
import type { Pane } from "./panes/fields";
import { linksPane } from "./panes/links";
import { musicPane } from "./panes/music";
import { profilePane } from "./panes/profile";
import { stylePane } from "./panes/style";
import { rolesPane } from "./panes/roles";

const PANES: Pane[] = [profilePane, linksPane, rolesPane, stylePane, musicPane, discordPane, extrasPane];
const SAVE_TEXT: Record<SaveState, string> = { idle: "", saving: "Saving…", saved: "Saved", error: "Couldn't save" };

/** The editor: tabs on the left, a live preview on the right. Returns a cleanup function. */
export function mountDashboard(root: HTMLElement): () => void {
  const me = store.me;
  if (!me) { navigate("/", true); return () => {}; }

  let active = PANES[0]!;
  try { active = PANES.find(p => p.id === sessionStorage.getItem("dusk.tab")) ?? active; } catch { /* storage unavailable */ }

  root.innerHTML = `<div class="dash" data-pane="edit">
    <header class="dash-top">
      <a class="logo" href="/" data-link>dusk</a>
      <span class="url-chip" id="chip"></span>
      <div class="seg mobile-switch" role="group" aria-label="Editor or preview">
        <button type="button" data-pane-btn="edit" aria-pressed="true">Edit</button>
        <button type="button" data-pane-btn="preview" aria-pressed="false">Preview</button>
      </div>
      <div class="top-r">
        ${me.vip ? '<span class="vip-chip" title="You are a VIP member">VIP</span>' : ""}
        <span class="saved" id="saved" role="status"></span>
        <a class="btn-ghost" href="/community" data-link>Community</a>
        <a class="btn-ghost" id="view" href="#" data-link>View my page</a>
        <button class="btn-text" type="button" id="logout">Log out</button>
      </div>
    </header>
    <div class="dash-body">
      <nav class="rail" role="tablist" aria-label="Editor sections" aria-orientation="vertical">${PANES.map((p, i) => `<button class="tab" style="--i:${i}" type="button" role="tab" data-tab="${p.id}" data-tip="${p.label}" aria-label="${p.label}" aria-selected="${p === active}">${railIcon(p.id)}</button>`).join("")}</nav>
      <aside class="side">
        <h2 class="side-title" id="side-title"></h2>
        <div class="side-body" id="pane"></div>
      </aside>
      <section class="preview-pane">
        <div class="pv-bar"><span>Live preview</span>
          <div class="seg dev" role="group" aria-label="Preview size"><button type="button" data-dev="desktop" aria-pressed="true">Desktop</button><button type="button" data-dev="mobile" aria-pressed="false">Phone</button></div>
        </div>
        <div class="frame" id="frame"></div>
      </section>
    </div>
  </div>`;

  const dash = must(".dash", root);
  const paneEl = must("#pane", root);
  const frame = must("#frame", root);
  const saved = must("#saved", root);
  const chip = must("#chip", root);
  const view = must<HTMLAnchorElement>("#view", root);

  const stage = new Stage(store.model!);
  frame.append(stage.el);

  let unmountPane: () => void = () => {};
  const openPane = (pane: Pane): void => {
    unmountPane();
    active = pane;
    try { sessionStorage.setItem("dusk.tab", pane.id); } catch { /* storage unavailable */ }
    root.querySelectorAll<HTMLElement>("[data-tab]").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === pane.id)));
    must("#side-title", root).textContent = pane.label;
    paneEl.scrollTop = 0;
    unmountPane = pane.mount(paneEl);
  };
  openPane(active);

  const refreshLinks = (): void => {
    const name = store.me?.user.username ?? "";
    chip.innerHTML = `${esc(location.host)}/<b>${esc(name)}</b>`;
    view.href = `/${encodeURIComponent(name)}`;
  };
  refreshLinks();

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
    const tab = t?.closest<HTMLElement>("[data-tab]");
    if (tab) { const p = PANES.find(x => x.id === tab.dataset.tab); if (p && p !== active) openPane(p); return; }
    const dev = t?.closest<HTMLElement>("[data-dev]");
    if (dev) {
      frame.classList.toggle("mobile", dev.dataset.dev === "mobile");
      root.querySelectorAll<HTMLElement>("[data-dev]").forEach(b => b.setAttribute("aria-pressed", String(b === dev)));
      return;
    }
    const pn = t?.closest<HTMLElement>("[data-pane-btn]");
    if (pn) {
      dash.dataset.pane = pn.dataset.paneBtn ?? "edit";
      root.querySelectorAll<HTMLElement>("[data-pane-btn]").forEach(b => b.setAttribute("aria-pressed", String(b === pn)));
      return;
    }
    if (t?.closest("#logout")) {
      void store.flush()
        .then(() => api.logout())
        .catch(() => { /* leaving anyway */ })
        .then(() => { store.setMe(null); navigate("/"); });
    }
  };
  root.addEventListener("click", click);

  return () => {
    root.removeEventListener("click", click);
    off();
    unmountPane();
    stage.destroy();
    void store.flush();
  };
}
