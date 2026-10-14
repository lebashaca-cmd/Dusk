import { RESERVED_USERNAMES } from "../shared/constants";

export type Route =
  | { name: "home" }
  | { name: "dashboard" }
  | { name: "community" }
  | { name: "public"; username: string };

export function parseRoute(pathname: string): Route {
  const path = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, "");
  if (path === "") return { name: "home" };
  if (path === "dashboard") return { name: "dashboard" };
  if (path === "community") return { name: "community" };
  const first = path.split("/")[0]?.toLowerCase() ?? "";
  if (RESERVED_USERNAMES.includes(first)) return { name: "home" };
  return { name: "public", username: first };
}

type Handler = (route: Route) => void;
let handler: Handler | null = null;

export function navigate(path: string, replace = false): void {
  if (path === location.pathname) { handler?.(parseRoute(path)); return; }
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  handler?.(parseRoute(path));
}

/** Calls `onRoute` now and whenever the address changes. Links marked data-link navigate without reloading. */
export function startRouter(onRoute: Handler): void {
  handler = onRoute;
  window.addEventListener("popstate", () => onRoute(parseRoute(location.pathname)));
  document.addEventListener("click", e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target instanceof Element ? e.target : null)?.closest<HTMLAnchorElement>("a[data-link]");
    if (!link) return;
    e.preventDefault();
    navigate(link.getAttribute("href") ?? "/");
  });
  onRoute(parseRoute(location.pathname));
}
