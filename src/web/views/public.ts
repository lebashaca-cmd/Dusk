import type { PublicProfile } from "../../shared/types";
import { api, ApiError } from "../api";
import { gateFill, gateHTML } from "../render/gate";
import { Stage } from "../render/stage";
import { store } from "../state";
import { MARK_SVG, setMeta } from "../ui/chrome";
import { icon } from "../ui/icons";
import { delegate, esc } from "../util/dom";

function missing(root: HTMLElement, username: string, message: string): void {
  root.innerHTML = `<div class="missing"><div><h1>@${esc(username)}</h1><p>${esc(message)}</p>
    <a class="btn-primary" href="/" data-link>Claim a name on dusk</a></div></div>`;
}

/** Someone's public page. Returns a cleanup function. */
export function mountPublic(root: HTMLElement, username: string): () => void {
  let stage: Stage | null = null;
  let dead = false;
  const undo: Array<() => void> = [];
  root.innerHTML = `<div class="missing"><div><p>Loading…</p></div></div>`;

  api.publicProfile(username).then((model: PublicProfile) => {
    if (dead) return;
    const name = model.profile.name || model.username;
    const bio = model.profile.bio.split("\n").map(l => l.trim()).filter(Boolean)[0] ?? "";
    document.title = `${name} · dusk`;
    const description = bio || `A page on dusk.`;
    const image = `${location.origin}/api/public/${encodeURIComponent(username)}/badge.svg`;
    setMeta("description", description);
    setMeta("og:title", `${name} · dusk`);
    setMeta("og:description", description);
    setMeta("og:url", location.href);
    setMeta("og:image", image);
    setMeta("twitter:title", `${name} · dusk`);
    setMeta("twitter:description", description);
    setMeta("twitter:image", image);

    const isOwner = store.me?.user.username === model.username;
    root.innerHTML = `<div class="public"></div>`;
    const host = root.querySelector<HTMLElement>(".public")!;
    stage = new Stage(model);
    host.append(stage.el);

    const bar = document.createElement("div");
    bar.className = "public-bar";
    bar.innerHTML = `<a class="pb-mark" href="/" data-link aria-label="dusk">${MARK_SVG}<span class="pb-word">dusk</span></a>
      <span class="pb-sp"></span>
      ${isOwner ? `<a class="pill" href="/dashboard" data-link>Edit page</a>` : ""}
      <button class="pill" type="button" id="copy-link">${icon("share")}Share</button>`;
    host.append(bar);

    // Copy the address, so a page can be sent on without leaving it.
    const copy = bar.querySelector<HTMLButtonElement>("#copy-link");
    copy?.addEventListener("click", () => {
      void navigator.clipboard?.writeText(location.href).then(() => {
        copy.textContent = "Copied";
        window.setTimeout(() => { copy.innerHTML = `${icon("share")}Share`; }, 1600);
      }).catch(() => { copy.textContent = "Copy failed"; });
    });

    // Count each open of a link, so the owner can see which ones people use.
    undo.push(delegate(host, "click", ".plink[data-link-id]", (_e, t) => {
      const id = t.dataset.linkId;
      if (id) void api.countClick(username, id).catch(() => { /* a missed count is fine */ });
    }));

    const begin = (): void => { stage?.startMusic(); };
    if (model.profile.page.enter) {
      const gate = document.createElement("button");
      gate.className = "gate";
      gate.type = "button";
      const design = model.profile.page.gate;
      if (design) { gate.classList.add("designed"); gate.style.background = gateFill(model, design); gate.setAttribute("aria-label", model.profile.page.enterText || "tap to enter"); gate.innerHTML = gateHTML(model, design); }
      else gate.innerHTML = `<span>${esc(model.profile.page.enterText || "tap to enter")}</span>`;
      gate.addEventListener("click", () => { gate.classList.add("hide"); begin(); window.setTimeout(() => gate.remove(), 900); });
      host.append(gate);
    } else {
      const once = (): void => { begin(); document.removeEventListener("pointerdown", once); };
      document.addEventListener("pointerdown", once);
      undo.push(() => document.removeEventListener("pointerdown", once));
      begin();
    }

    if (!isOwner) void api.countView(model.username).catch(() => { /* a missed count is fine */ });
  }).catch((e: unknown) => {
    if (dead) return;
    missing(root, username, e instanceof ApiError && e.status === 404 ? "Nobody has this name yet." : "This page couldn't be loaded. Try again in a moment.");
  });

  return () => {
    dead = true;
    undo.forEach(fn => fn());
    stage?.destroy();
    document.title = "dusk";
  };
}
