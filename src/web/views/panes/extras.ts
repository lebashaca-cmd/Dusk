import { defaultBoard, LYRIC_PROVIDER_NAMES } from "../../../shared/constants";
import type { LyricProvider } from "../../../shared/types";
import { api, ApiError } from "../../api";
import { navigate } from "../../router";
import { store } from "../../state";
import { toast } from "../../ui/toast";
import { esc, must } from "../../util/dom";
import { bindFields, choiceGrid, group, selectField, textField, toggle, type Choice, type Pane } from "./fields";

/** The two ways a page can be put together. */
const LAYOUT_CHOICES: readonly Choice[] = [
  { value: "regular", label: "Regular", pv: "layout-regular" },
  { value: "experimental", label: "Experimental", pv: "layout-experimental" },
];

/** The order the lyrics services are offered in. */
const PROVIDER_ORDER: readonly LyricProvider[] = ["lrclib", "polarisMono", "polaris", "genius"];

/** Pages you own (owners and devs can have several) and the delete button. */
function pagesHTML(): string {
  const me = store.me!;
  const list = me.pages.length > 1 || me.canMultiPage
    ? group("Your pages",
      `<ul class="page-list">${me.pages.map(p => `<li${p.active ? ' class="on"' : ""}>
          <span><b>${esc(p.username)}</b>${p.active ? " · editing" : ""}</span>
          ${p.active ? "" : `<button class="btn-ghost" type="button" data-switch="${esc(p.id)}">Edit</button>`}
        </li>`).join("")}</ul>` +
      (me.canMultiPage
        ? (me.pages.length < me.maxPages
          ? `<form class="page-new" id="page-new"><input type="text" id="page-new-name" placeholder="new page name" maxlength="20" autocomplete="off" spellcheck="false" aria-label="New page name"><button class="btn-primary" type="submit">Create page</button></form>
             <p class="note">Each page has its own link, songs, links and style. Your Discord status and roles are shared.</p>`
          : `<p class="note">You have reached the limit of ${me.maxPages} pages.</p>`)
        : ""))
    : "";
  const last = me.pages.length <= 1;
  const del = group("Delete page",
    `<p class="note">${last
      ? "This deletes your page, its songs and uploads, and your account here. You can sign up again later."
      : "This deletes this page, its songs and uploads. Your other pages stay."} It can't be undone.</p>
     <button class="btn-danger" type="button" id="del-open">Delete this page</button>
     <form class="del-confirm" id="del-confirm" hidden>
       <label class="fld"><span>Type <b>${esc(me.user.username)}</b> to confirm</span><input type="text" id="del-name" autocomplete="off" spellcheck="false"></label>
       <div class="del-row"><button class="btn-danger" type="submit" id="del-go" disabled>Delete for good</button><button class="btn-ghost" type="button" id="del-cancel">Cancel</button></div>
     </form>`);
  return list + del;
}

/** The settings that decide what a visitor gets: the shape of the page, and where the words come from. */
function settingsHTML(): string {
  const p = store.profile;
  const infos = store.me?.lyricsProviders ?? [];
  const chosen = infos.find(i => i.id === p.page.lyricsProvider);
  const options = PROVIDER_ORDER.map(id => {
    const known = infos.find(i => i.id === id);
    const name = known?.name ?? LYRIC_PROVIDER_NAMES[id];
    return [id, known && !known.ready ? `${name} · not set up` : name] as const;
  });

  // The little pictures use the page's own colours, like the ones in the Look section.
  const swatch = `--bg:${p.colors.bg};--bg2:${p.colors.bg2};--ac:${p.colors.accent};--tx:${p.colors.text}`;

  return group("Page",
    toggle("page.enter", "Show an enter screen first", p.page.enter) +
    textField("page.enterText", "Enter screen text", p.page.enterText, { max: 30 }) +
    `<p class="note">Browsers only start music after a tap, so the enter screen is what lets your song play right away.</p>` +
    toggle("page.views", "Show the view counter", p.page.views) +
    toggle("page.share", "Show a share button", p.page.share)) +
  group("Layout",
    choiceGrid("page.layout", "How your page is put together", p.page.layout, LAYOUT_CHOICES, false, { cols: 2, style: swatch }) +
    `<p class="note">${p.page.layout === "experimental"
      ? "Your page is the free-form board. Open <b>Page board</b> in the rail to move the pieces around."
      : "Your page is the usual column: your picture and name, then your links, then your music."}</p>`) +
  group("Lyrics",
    selectField("page.lyricsProvider", "Where the words come from", p.page.lyricsProvider, options) +
    `<p class="note">${esc(chosen?.note ?? "")}</p>`);
}

export const extrasPane: Pane = {
  id: "page",
  label: "Page",
  hint: "How the page itself behaves when people open it.",
  mount(el) {
    el.innerHTML = `<div id="page-settings"></div>${pagesHTML()}`;
    const settings = must<HTMLElement>("#page-settings", el);
    const drawSettings = (): void => { settings.innerHTML = settingsHTML(); };
    drawSettings();

    const after = (path: string): boolean => {
      // The experimental layout needs a board to start from, so it is filled in the first time.
      if (path === "page.layout" && store.profile.page.layout === "experimental" && !store.profile.page.board.length) {
        store.profile.page.board = defaultBoard();
      }
      return path === "page.layout" || path === "page.lyricsProvider";
    };
    const unbind = bindFields(el, after, drawSettings);

    const reload = async (): Promise<void> => { window.location.assign("/dashboard"); };
    const fail = (e: unknown): void => toast(e instanceof ApiError ? e.message : "Something went wrong. Try again.");

    const onClick = (e: Event): void => {
      const t = e.target instanceof Element ? e.target : null;
      const sw = t?.closest<HTMLElement>("[data-switch]");
      if (sw?.dataset.switch) {
        void store.flush().then(() => api.switchPage(sw.dataset.switch!)).then(reload).catch(fail);
        return;
      }
      if (t?.closest("#del-open")) {
        el.querySelector<HTMLElement>("#del-confirm")!.hidden = false;
        el.querySelector<HTMLElement>("#del-open")!.hidden = true;
        el.querySelector<HTMLInputElement>("#del-name")!.focus();
      } else if (t?.closest("#del-cancel")) {
        el.querySelector<HTMLElement>("#del-confirm")!.hidden = true;
        el.querySelector<HTMLElement>("#del-open")!.hidden = false;
      }
    };
    const onInput = (e: Event): void => {
      const t = e.target as HTMLElement;
      if (t.id !== "del-name") return;
      el.querySelector<HTMLButtonElement>("#del-go")!.disabled = (t as HTMLInputElement).value.trim().toLowerCase() !== store.me!.user.username;
    };
    const onSubmit = (e: Event): void => {
      const form = e.target as HTMLFormElement;
      if (form.id === "page-new") {
        e.preventDefault();
        const name = el.querySelector<HTMLInputElement>("#page-new-name")!.value.trim().toLowerCase();
        void store.flush().then(() => api.createPage(name)).then(reload).catch(fail);
      } else if (form.id === "del-confirm") {
        e.preventDefault();
        const me = store.me!;
        void api.deletePage(me.user.id).then(r => {
          if (r.loggedOut) { store.setMe(null); navigate("/", true); window.location.assign("/"); } else void reload();
        }).catch(fail);
      }
    };
    el.addEventListener("click", onClick);
    el.addEventListener("input", onInput);
    el.addEventListener("submit", onSubmit);
    return () => {
      unbind();
      el.removeEventListener("click", onClick);
      el.removeEventListener("input", onInput);
      el.removeEventListener("submit", onSubmit);
    };
  },
};
