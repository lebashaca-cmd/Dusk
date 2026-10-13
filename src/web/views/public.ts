import type { PublicProfile } from "../../shared/types";
import { api, ApiError } from "../api";
import { Stage } from "../render/stage";
import { store } from "../state";
import { esc } from "../util/dom";

function missing(root: HTMLElement, username: string, message: string): void {
  root.innerHTML = `<div class="missing"><div><h1>@${esc(username)}</h1><p>${esc(message)}</p>
    <a class="btn-white" href="/" data-link>Claim a name on dusk</a></div></div>`;
}

/** Someone's public page. Returns a cleanup function. */
export function mountPublic(root: HTMLElement, username: string): () => void {
  let stage: Stage | null = null;
  let dead = false;
  const undo: Array<() => void> = [];
  root.innerHTML = `<div class="missing"><div><p>Loading…</p></div></div>`;

  api.publicProfile(username).then((model: PublicProfile) => {
    if (dead) return;
    document.title = `${model.profile.name || model.username} · dusk`;
    const isOwner = store.me?.user.username === model.username;
    root.innerHTML = `<div class="public"></div>`;
    const host = root.querySelector<HTMLElement>(".public")!;
    stage = new Stage(model);
    host.append(stage.el);

    const bar = document.createElement("div");
    bar.className = "public-bar";
    bar.innerHTML = `<a class="pill" href="/" data-link>dusk</a>${isOwner ? `<a class="pill" href="/dashboard" data-link>Edit page</a>` : ""}`;
    host.append(bar);

    const begin = (): void => { stage?.startMusic(); };
    if (model.profile.page.enter) {
      const gate = document.createElement("button");
      gate.className = "gate";
      gate.type = "button";
      gate.innerHTML = `<span>${esc(model.profile.page.enterText || "tap to enter")}</span>`;
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
