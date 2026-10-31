import { CHANGELOG, type ChangelogEntry } from "../../shared/changelog";
import { store } from "../state";
import { MARK_SVG } from "../ui/chrome";
import { esc } from "../util/dom";

const day = (iso: string): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
};

function entryHTML(e: ChangelogEntry): string {
  const part = (label: string, items?: string[]): string =>
    items?.length ? `<h3 class="cl-tag">${label}</h3><ul>${items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
  return `<article class="cl-entry">
    <time datetime="${esc(e.date)}">${esc(day(e.date))}</time>
    <div><h2>${esc(e.title)}</h2>${part("Added", e.added)}${part("Improved", e.improved)}${part("Fixed", e.fixed)}</div>
  </article>`;
}

/** The Changelog page: what changed on dusk, newest first. Returns a cleanup function. */
export function mountChangelog(root: HTMLElement): () => void {
  const me = store.me;
  root.innerHTML = `<div class="community changelog">
    <header class="cm-top">
      <a class="mark" href="/" data-link aria-label="dusk">${MARK_SVG}<b>dusk</b></a>
      <div class="top-r">${me ? `<a class="btn-ghost" href="/dashboard" data-link>Dashboard</a>` : `<a class="btn-text" href="/auth/discord" data-login="login">Log in</a>`}</div>
    </header>
    <div class="cm-hero">
      <span class="cm-kicker">what's new</span>
      <h1>Changelog</h1>
      <p>Everything that changed on dusk, newest first.</p>
    </div>
    <section class="cm-main cl-list">${CHANGELOG.map(entryHTML).join("")}</section>
  </div>`;
  document.title = "Changelog · dusk";
  return () => {};
}
