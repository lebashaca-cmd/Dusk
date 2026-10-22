import { esc } from "../util/dom";

/** The backdrop every page sits on: a soft light above, darkness below, and a little grain. */
export const SKY = `<div class="sky" aria-hidden="true"><i></i><i></i><i></i></div><div class="grain" aria-hidden="true"></div>`;

/** A sun on the horizon. The dusk mark. */
export const MARK_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 16.4a8.6 8.6 0 0 1 17.2 0z" fill="currentColor" opacity=".2"/><path d="M3.4 16.4h17.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="9.4" r="3.7" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`;

export function mark(href = "/", label = "dusk"): string {
  return `<a class="mark" href="${href}" data-link>${MARK_SVG}<b>${esc(label)}</b></a>`;
}

export interface NavOptions {
  loggedIn: boolean;
  /** Which section is the current one, so it can be marked as such. */
  current?: "community" | "dashboard" | "";
  /** Extra buttons on the right, before the account ones. */
  extra?: string;
}

/** The bar at the top of the site. */
export function siteNav(o: NavOptions): string {
  const link = (href: string, label: string, id: NavOptions["current"]): string =>
    `<a class="nav-link${o.current === id ? " on" : ""}" href="${href}" data-link>${esc(label)}</a>`;
  return `<nav class="nav">
    ${mark("/")}
    <div class="nav-r">
      ${o.extra ?? ""}
      ${link("/community", "Community", "community")}
      ${o.loggedIn ? link("/dashboard", "Dashboard", "dashboard") : `<a class="btn-text" href="/auth/discord">Log in</a>`}
    </div>
  </nav>`;
}

/** The strip at the bottom of the front page: how many pages there are, and who made it. */
export function siteFooter(): string {
  return `<footer class="foot">
    <div class="stats" aria-label="Site stats">
      <div><b class="figure" data-stat="pages">–</b><span>pages made</span></div>
      <div><b class="figure" data-stat="users">–</b><span>users</span></div>
      <div><b class="figure" data-stat="online">–</b><span><i class="live-dot"></i>online now</span></div>
    </div>
    <p class="credit">©Provided By <a id="credit-link" href="#" target="_blank" rel="noopener noreferrer">Risk</a></p>
  </footer>`;
}

/**
 * Set a meta tag, so a page can describe itself while it is open. The server puts the same
 * tags in the HTML it sends, which is what a crawler without JavaScript reads.
 */
export function setMeta(key: string, content: string): void {
  const name = key.startsWith("og:") ? "property" : "name";
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${name}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(name, key);
    document.head.append(tag);
  }
  tag.setAttribute("content", content);
}
