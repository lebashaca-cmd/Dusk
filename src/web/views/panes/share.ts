import { store } from "../../state";
import { drawShareImage } from "../../render/preview";
import { esc, must } from "../../util/dom";
import { group, type Pane } from "./fields";

/** Copy text and say so. */
function copy(text: string, button: HTMLElement, done = "Copied"): void {
  const original = button.textContent ?? "";
  void navigator.clipboard?.writeText(text).then(() => {
    button.textContent = done;
    window.setTimeout(() => { button.textContent = original; }, 1600);
  }).catch(() => { button.textContent = "Copy failed"; });
}

/** Send people to the page, and make a picture of it to show off. */
export const sharePane: Pane = {
  id: "share",
  label: "Share",
  hint: "Send people to your page, or make a picture of it to post.",
  mount(el) {
    const username = store.me?.user.username ?? "";
    const page = `${location.origin}/${encodeURIComponent(username)}`;
    const badge = `${location.origin}/api/public/${encodeURIComponent(username)}/badge.svg`;
    const snippet = `[![dusk](${badge})](${page})`;

    el.innerHTML = group("Your address",
      `<div class="share-row"><input class="inp" type="text" readonly value="${esc(page)}" aria-label="Your page address">
        <button class="btn-ghost" type="button" data-copy="${esc(page)}">Copy</button></div>
       <p class="note">This is where your page lives. Put it in your bio, your Discord profile or anywhere else.</p>`) +
      group("A picture to post",
        `<canvas class="share-canvas" width="1200" height="630" aria-label="A picture of your page"></canvas>
         <div class="share-row">
           <button class="btn-primary" type="button" data-download>Download the picture</button>
           <button class="btn-ghost" type="button" data-copy="${esc(page)}">Copy link</button>
         </div>
         <p class="note">The picture is drawn here in your browser, in the colours of your page. Save it and post it wherever you like.</p>`) +
      group("For a README",
        `<div class="share-row"><input class="inp" type="text" readonly value="${esc(snippet)}" aria-label="Badge markup">
          <button class="btn-ghost" type="button" data-copy="${esc(snippet)}">Copy</button></div>
         <p class="note">A small badge of your page, for a project you keep on GitHub. It follows the colours you pick.</p>`);

    const canvas = must<HTMLCanvasElement>(".share-canvas", el);
    const model = store.model;
    if (model) {
      const paint = (): void => drawShareImage(canvas, model);
      if (document.fonts?.ready) void document.fonts.ready.then(paint); else paint();
    }

    el.addEventListener("click", e => {
      const t = e.target instanceof Element ? e.target : null;
      const copyBtn = t?.closest<HTMLElement>("[data-copy]");
      if (copyBtn) { copy(copyBtn.dataset.copy ?? "", copyBtn); return; }
      if (t?.closest("[data-download]")) {
        canvas.toBlob(blob => {
          if (!blob) return;
          const href = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = href;
          a.download = `${username || "dusk"}-preview.png`;
          a.click();
          window.setTimeout(() => URL.revokeObjectURL(href), 4000);
        }, "image/png");
      }
    });

    return () => { /* nothing to tear down */ };
  },
};
