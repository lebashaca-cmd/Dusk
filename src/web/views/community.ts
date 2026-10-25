import { api, ApiError } from "../api";
import { store } from "../state";
import { MARK_SVG } from "../ui/chrome";
import { toast } from "../ui/toast";
import { esc, must } from "../util/dom";
import { FONTS } from "../../shared/constants";
import type { CommunityMe, CommunityProfile, CommunityTemplate, ProfileColors } from "../../shared/types";

type Tab = "profile" | "templates";

const swatch = (c: ProfileColors): string => `background:linear-gradient(135deg,${esc(c.bg)},${esc(c.bg2)});--ac:${esc(c.accent)};--tx:${esc(c.text)}`;
const fail = (e: unknown): void => toast(e instanceof ApiError ? e.message : "Something went wrong. Try again.");

function profileCard(p: CommunityProfile, n: number): string {
  const img = p.avatarUrl ?? p.discordAvatarUrl;
  const av = img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer">` : `<span>${esc(p.name.charAt(0).toUpperCase() || "?")}</span>`;
  return `<a class="cm-card cm-profile" href="/${encodeURIComponent(p.username)}" style="--i:${n}">
    <div class="cm-cover" style="${swatch(p.colors)}"><i></i></div>
    <div class="cm-av">${av}</div>
    <div class="cm-body"><b>${esc(p.name)}</b><small>@${esc(p.username)}</small>${p.bio ? `<p>${esc(p.bio)}</p>` : ""}</div>
  </a>`;
}

function templateCard(t: CommunityTemplate, n: number, loggedIn: boolean): string {
  const font = FONTS[t.font]?.label ?? "";
  return `<article class="cm-card cm-template" style="--i:${n}">
    <div class="cm-cover tall" style="${swatch(t.colors)}"><i></i><span style="color:${esc(t.colors.text)}">Aa</span></div>
    <div class="cm-body"><b>${esc(t.name)}</b><small>by @${esc(t.author)}${font ? ` · ${esc(font)}` : ""}</small>${t.description ? `<p>${esc(t.description)}</p>` : ""}</div>
    <div class="cm-foot"><span>${t.uses} ${t.uses === 1 ? "use" : "uses"}</span>
      ${t.mine ? `<button class="btn-ghost" type="button" data-del="${esc(t.id)}">Delete</button>` : ""}
      ${loggedIn ? `<button class="btn-primary" type="button" data-use="${esc(t.id)}">Use</button>` : `<a class="btn-ghost" href="/auth/discord" data-login="login">Log in to use</a>`}
    </div>
  </article>`;
}

/** The Community page: pages people chose to show, and looks people shared. Returns a cleanup function. */
export function mountCommunity(root: HTMLElement): () => void {
  const me = store.me;
  let tab: Tab = location.hash === "#templates" ? "templates" : "profile";
  let mine: CommunityMe | null = null;
  let alive = true;

  root.innerHTML = `<div class="community">
    <header class="cm-top">
      <a class="mark" href="/" data-link aria-label="dusk">${MARK_SVG}<b>dusk</b></a>
      <div class="top-r">${me ? `<a class="btn-ghost" href="/dashboard" data-link>Dashboard</a>` : `<a class="btn-text" href="/auth/discord" data-login="login">Log in</a>`}</div>
    </header>
    <div class="cm-hero">
      <span class="cm-kicker">the gallery</span>
      <h1>Community</h1>
      <p>Pages people chose to show, and looks they shared. Take one and make it yours — your name, bio and links stay yours.</p>
      <div class="seg cm-tabs" role="tablist" aria-label="Community sections">
        <button type="button" role="tab" data-tab="profile">Pages</button>
        <button type="button" role="tab" data-tab="templates">Looks</button>
      </div>
    </div>
    <section id="cm-body" class="cm-main" aria-live="polite"></section>
  </div>`;
  document.title = "Community · dusk";
  const body = must("#cm-body", root);

  const setTabs = (): void => {
    root.querySelectorAll<HTMLElement>("[data-tab]").forEach(b => {
      b.setAttribute("aria-selected", String(b.dataset.tab === tab));
      b.setAttribute("aria-pressed", String(b.dataset.tab === tab));
    });
  };

  const drawProfiles = async (): Promise<void> => {
    body.innerHTML = `<p class="cm-note">Loading…</p>`;
    try {
      const [list, my] = await Promise.all([api.communityProfiles(), me ? api.communityMe().catch(() => null) : Promise.resolve(null)]);
      if (!alive || tab !== "profile") return;
      mine = my;
      const panel = me
        ? `<div class="cm-panel">
            <div><b>Show my page here</b><p>${mine?.hasBio === false ? "Write a bio in the dashboard first. The Community shows your name and your bio." : "Your name, picture and bio appear here with a link to your page. You can switch it off any time."}</p></div>
            <label class="sw cm-sw"><span class="sr">Show my page in the Community</span><input type="checkbox" id="cm-listed"${mine?.listed ? " checked" : ""}></label>
          </div>`
        : `<div class="cm-panel"><div><b>Want your page here?</b><p>Log in, write a bio, then turn on "Show my page here".</p></div><a class="btn-primary" href="/auth/discord" data-login="login">Log in</a></div>`;
      body.innerHTML = panel + (list.length
        ? `<h2 class="cm-sec">Pages on show <em>${list.length}</em></h2>
           <div class="cm-grid">${list.map(profileCard).join("")}</div>`
        : `<p class="cm-empty">Nobody has shown their page here yet.${me ? " You could be first." : ""}</p>`);
    } catch (e) { if (alive) body.innerHTML = `<p class="cm-empty">Couldn't load this. ${e instanceof ApiError ? esc(e.message) : ""}</p>`; }
  };

  const drawTemplates = async (): Promise<void> => {
    body.innerHTML = `<p class="cm-note">Loading…</p>`;
    try {
      const list = await api.communityTemplates();
      if (!alive || tab !== "templates") return;
      const share = me
        ? `<form class="cm-panel cm-share" id="cm-share">
            <div><b>Share my current style</b><p>Copies the look of the page you're editing (theme, colors, fonts, card, background, effects). Your links, bio, songs and name are never shared.</p></div>
            <div class="cm-share-f"><input type="text" id="cm-tname" placeholder="Template name" maxlength="40" required aria-label="Template name"><input type="text" id="cm-tdesc" placeholder="Short description (optional)" maxlength="140" aria-label="Description"><button class="btn-primary" type="submit">Share</button></div>
          </form>`
        : `<div class="cm-panel"><div><b>Share your style</b><p>Log in to share the look of your page as a template, or to use one.</p></div><a class="btn-primary" href="/auth/discord" data-login="login">Log in</a></div>`;
      body.innerHTML = share + (list.length
        ? `<h2 class="cm-sec">Shared looks <em>${list.length}</em></h2>
           <div class="cm-grid">${list.map((t, i) => templateCard(t, i, Boolean(me))).join("")}</div>`
        : `<p class="cm-empty">No templates yet.${me ? " Share your style to be first." : ""}</p>`);
    } catch (e) { if (alive) body.innerHTML = `<p class="cm-empty">Couldn't load this. ${e instanceof ApiError ? esc(e.message) : ""}</p>`; }
  };

  const draw = (): void => { setTabs(); void (tab === "profile" ? drawProfiles() : drawTemplates()); };
  draw();

  const onClick = (e: Event): void => {
    const t = e.target instanceof Element ? e.target : null;
    const tabBtn = t?.closest<HTMLElement>("[data-tab]");
    if (tabBtn) {
      const next = tabBtn.dataset.tab as Tab;
      if (next !== tab) { tab = next; history.replaceState(null, "", next === "templates" ? "#templates" : location.pathname); draw(); }
      return;
    }
    const use = t?.closest<HTMLElement>("[data-use]");
    if (use?.dataset.use) {
      if (!window.confirm("Put this template's look on the page you're editing? Your links, bio and songs stay the same.")) return;
      (use as HTMLButtonElement).disabled = true;
      void api.useTemplate(use.dataset.use)
        .then(next => { store.setMe(next); toast("Template applied. Open the dashboard to fine-tune it."); draw(); })
        .catch(e2 => { (use as HTMLButtonElement).disabled = false; fail(e2); });
      return;
    }
    const del = t?.closest<HTMLElement>("[data-del]");
    if (del?.dataset.del) {
      if (!window.confirm("Delete this template from the Community?")) return;
      void api.deleteTemplate(del.dataset.del).then(() => { toast("Template deleted"); draw(); }).catch(fail);
    }
  };
  const onChange = (e: Event): void => {
    const t = e.target as HTMLInputElement;
    if (t.id !== "cm-listed") return;
    void api.setListed(t.checked)
      .then(r => { mine = r; toast(r.listed ? "Your page is now shown here" : "Your page is hidden"); draw(); })
      .catch(err => { t.checked = !t.checked; fail(err); });
  };
  const onSubmit = (e: Event): void => {
    const form = e.target as HTMLFormElement;
    if (form.id !== "cm-share") return;
    e.preventDefault();
    const name = must<HTMLInputElement>("#cm-tname", form).value;
    const desc = must<HTMLInputElement>("#cm-tdesc", form).value;
    void store.flush()
      .then(() => api.shareTemplate(name, desc))
      .then(() => { toast("Template shared"); draw(); })
      .catch(fail);
  };
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  root.addEventListener("submit", onSubmit);

  return () => {
    alive = false;
    root.removeEventListener("click", onClick);
    root.removeEventListener("change", onChange);
    root.removeEventListener("submit", onSubmit);
    document.title = "dusk";
  };
}
