import { api } from "../api";
import { Stage } from "../render/stage";
import { navigate } from "../router";
import { store, type SaveState } from "../state";
import { MARK_SVG } from "../ui/chrome";
import { mountPalette, type Command } from "../ui/palette";
import { esc, must } from "../util/dom";
import { railIcon } from "./icons";
import { discordPane } from "./panes/discord";
import { extrasPane } from "./panes/extras";
import type { Pane } from "./panes/fields";
import { groupsPane } from "./panes/groups";
import { insightsPane } from "./panes/insights";
import { linksPane } from "./panes/links";
import { musicPane } from "./panes/music";
import { profilePane } from "./panes/profile";
import { sharePane } from "./panes/share";
import { stylePane } from "./panes/style";
import { rolesPane } from "./panes/roles";

const PANES: Pane[] = [profilePane, linksPane, groupsPane, rolesPane, stylePane, musicPane, discordPane, extrasPane, insightsPane, sharePane];

/** The sections in the sidebar, in the order they appear. */
const SECTIONS: ReadonlyArray<{ label: string; ids: string[] }> = [
  { label: "Your page", ids: ["profile", "links", "groups"] },
  { label: "Look", ids: ["style"] },
  { label: "Extras", ids: ["music", "discord", "roles"] },
  { label: "Settings", ids: ["page"] },
  { label: "Measure", ids: ["insights", "share"] },
];

const SAVE_TEXT: Record<SaveState, string> = { idle: "", saving: "Saving…", saved: "Saved", error: "Couldn't save" };

/** The editor: a labelled sidebar, the form in the middle, a live preview on the right. */
export function mountDashboard(root: HTMLElement): () => void {
  const me = store.me;
  if (!me) { navigate("/", true); return () => {}; }

  let active = PANES[0]!;
  // The pane can be named in the address (#groups), which makes a link to one part of the editor.
  const fromHash = (): Pane | undefined => PANES.find(p => p.id === location.hash.slice(1));
  try { active = PANES.find(p => p.id === sessionStorage.getItem("dusk.tab")) ?? active; } catch { /* storage unavailable */ }
  active = fromHash() ?? active;

  const navHTML = SECTIONS.map(sec => {
    const items = sec.ids
      .map(id => PANES.find(p => p.id === id))
      .filter((p): p is Pane => Boolean(p))
      .map(p => `<button class="tab" type="button" role="tab" data-tab="${p.id}" aria-selected="${p === active}">
          <span class="tab-ic">${railIcon(p.id)}</span><span class="tab-label">${esc(p.label)}</span></button>`)
      .join("");
    return `<div class="nav-sec"><span class="nav-sec-label">${esc(sec.label)}</span>${items}</div>`;
  }).join("");

  root.innerHTML = `<div class="dash" data-pane="edit">
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
    <div class="dash-body">
      <nav class="dash-nav" role="tablist" aria-label="Editor sections" aria-orientation="vertical">${navHTML}</nav>
      <aside class="side">
        <div class="side-head">
          <h2 class="side-title" id="side-title"></h2>
          <p class="side-hint" id="side-hint"></p>
        </div>
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
    if (fromHash() !== pane) history.replaceState(null, "", `#${pane.id}`);
    root.querySelectorAll<HTMLElement>("[data-tab]").forEach(t => t.setAttribute("aria-selected", String(t.dataset.tab === pane.id)));
    must("#side-title", root).textContent = pane.label;
    must("#side-hint", root).textContent = pane.hint ?? "";
    paneEl.scrollTop = 0;
    unmountPane = pane.mount(paneEl);
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

  const logout = (): void => {
    void store.flush()
      .then(() => api.logout())
      .catch(() => { /* leaving anyway */ })
      .then(() => { store.setMe(null); navigate("/"); });
  };

  /* The command palette: every section, plus a few things you can do. */
  const commands = (): Command[] => [
    ...PANES.map(p => ({ id: p.id, label: p.label, hint: "Section", group: "Jump to", run: () => openPane(p) })),
    { id: "dev-desktop", label: "Preview on a desktop", group: "Preview", run: () => setDevice("desktop") },
    { id: "dev-mobile", label: "Preview on a phone", group: "Preview", run: () => setDevice("mobile") },
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
    const tab = t?.closest<HTMLElement>("[data-tab]");
    if (tab) { const p = PANES.find(x => x.id === tab.dataset.tab); if (p && p !== active) openPane(p); return; }
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
    unmountPane();
    stage.destroy();
    void store.flush();
  };
}
