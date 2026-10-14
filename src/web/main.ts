import { mountCommunity } from "./views/community";
import { mountDashboard } from "./views/dashboard";
import { mountHome } from "./views/home";
import { mountPublic } from "./views/public";
import { api } from "./api";
import { startRouter, type Route } from "./router";
import { store } from "./state";
import { must } from "./util/dom";

const root = must("#app");
let cleanup: () => void = () => {};

function show(route: Route): void {
  cleanup();
  cleanup = () => {};
  root.replaceChildren();
  document.title = "dusk";
  switch (route.name) {
    case "home": cleanup = mountHome(root); break;
    case "dashboard": cleanup = mountDashboard(root); break;
    case "community": cleanup = mountCommunity(root); break;
    case "public": cleanup = mountPublic(root, route.username); break;
  }
}

/* Tell the server this browser has the site open, so the front page can show how many people are here. */
function startCheckIns(): void {
  let id = "";
  try { id = sessionStorage.getItem("dusk.visit") ?? ""; } catch { /* storage unavailable */ }
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("");
    try { sessionStorage.setItem("dusk.visit", id); } catch { /* storage unavailable */ }
  }
  const ping = (): void => { if (!document.hidden) void api.ping(id).catch(() => { /* a missed check-in is fine */ }); };
  ping();
  window.setInterval(ping, 30_000);
  document.addEventListener("visibilitychange", ping);
}

startCheckIns();
await store.load();
startRouter(show);
