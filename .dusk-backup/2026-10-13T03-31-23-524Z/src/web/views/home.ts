import { USERNAME_HELP, checkUsernameFormat, cleanUsername } from "../../shared/url";
import { api } from "../api";
import { store } from "../state";
import { icon } from "../ui/icons";
import { esc, must } from "../util/dom";

const MARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 14c5 0 7-5 18-3" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

const LOGIN_MESSAGES: Record<string, string> = {
  failed: "Discord login didn't finish. Please try again.",
  join: "You need to join our Discord server first. Join it, then log in again.",
  cancelled: "Discord login was cancelled.",
};

/** The landing page: claim a username, then continue with Discord. Returns a cleanup function. */
export function mountHome(root: HTMLElement): () => void {
  const me = store.me;
  const notice = LOGIN_MESSAGES[new URLSearchParams(location.search).get("login") ?? ""] ?? "";

  const action = me
    ? `<div class="welcome">
        ${me.user.discordAvatarUrl ? `<img src="${esc(me.user.discordAvatarUrl)}" alt="" referrerpolicy="no-referrer">` : `<span class="wl">${esc(me.user.username.charAt(0).toUpperCase())}</span>`}
        <p>Signed in as <b>${esc(me.user.discordName)}</b><small>${esc(location.host)}/${esc(me.user.username)}</small></p>
        <a class="btn-white" href="/dashboard" data-link>Open dashboard</a>
      </div>`
    : `<form class="claim" id="claim" autocomplete="off">
        <label class="claim-field"><span class="pre">${esc(location.host)}/</span><input id="name" name="name" placeholder="yourname" maxlength="20" spellcheck="false" autocapitalize="none" aria-label="Username"></label>
        <button class="btn-white" id="go" type="submit">Claim</button>
      </form>
      <p class="hint" id="hint" role="status" aria-live="polite">${esc(notice) || "Pick a name, then continue with Discord."}</p>`;

  root.innerHTML = `<div class="home">
    <nav class="nav">
      <a class="logo" href="/" data-link>${MARK}dusk</a>
      <div class="nav-r">${me ? `<a class="btn-ghost" href="/dashboard" data-link>Dashboard</a>` : `<a class="btn-text" href="/auth/discord">Log in</a>`}</div>
    </nav>
    <main class="hero">
      <section class="intro">
        <h1 class="wordmark">dusk</h1>
        <p class="lede">One page for your links, your Discord status and your music, with lyrics that follow the song.</p>
        ${action}
      </section>
      <aside class="demo" aria-label="Preview">
        <div class="device"><div class="device-empty"><div>${icon("music")}<strong>Your page shows up here</strong><span>Log in with Discord, add your links and upload a song. Nothing here is pre-filled.</span></div></div></div>
        <p class="cap">Discord login · Lanyard presence · LRCLIB lyrics</p>
      </aside>
    </main>
    <footer class="stats" aria-label="Site stats">
      <div><b data-stat="pages">–</b><span>pages made</span></div>
      <div><b data-stat="users">–</b><span>users</span></div>
      <div><b data-stat="online">–</b><span><i class="live-dot"></i>online now</span></div>
    </footer>
  </div>`;

  let alive = true;
  let statsTimer = 0;
  const loadStats = (): void => {
    api.stats().then(s => {
      if (!alive) return;
      for (const key of ["pages", "users", "online"] as const) {
        const el = root.querySelector<HTMLElement>(`[data-stat=${key}]`);
        if (el) el.textContent = s[key].toLocaleString("en-US");
      }
    }).catch(() => { /* leave the dashes */ });
  };
  loadStats();
  statsTimer = window.setInterval(loadStats, 20_000);
  const stopStats = (): void => { alive = false; window.clearInterval(statsTimer); };

  if (me) return stopStats;

  const form = must<HTMLFormElement>("#claim", root);
  const input = must<HTMLInputElement>("#name", root);
  const hint = must("#hint", root);
  const go = must<HTMLButtonElement>("#go", root);
  let ok = false;
  let timer = 0;
  let seq = 0;

  const say = (text: string, kind: "" | "err" | "ok" = ""): void => {
    hint.textContent = text;
    hint.className = `hint ${kind}`.trim();
  };

  input.addEventListener("input", () => {
    const name = cleanUsername(input.value);
    if (input.value !== name) input.value = name;
    ok = false;
    window.clearTimeout(timer);
    if (!name) { say("Pick a name, then continue with Discord."); return; }
    if (checkUsernameFormat(name) === "format") { say(USERNAME_HELP, "err"); return; }
    say("Checking…");
    const mine = ++seq;
    timer = window.setTimeout(() => {
      api.checkUsername(name).then(r => {
        if (mine !== seq) return;
        ok = r.available;
        say(r.available ? `${location.host}/${name} is yours if you want it.` : r.reason, r.available ? "ok" : "err");
      }).catch(() => { if (mine === seq) say("Couldn't check that name. Try again.", "err"); });
    }, 300);
  });

  form.addEventListener("submit", e => {
    e.preventDefault();
    const name = cleanUsername(input.value);
    if (!name) { input.focus(); say("Type the name you want first.", "err"); return; }
    if (!ok) { say(checkUsernameFormat(name) ? USERNAME_HELP : "Wait for the name check, or try another name.", "err"); return; }
    go.disabled = true;
    location.href = `/auth/discord?claim=${encodeURIComponent(name)}`;
  });

  void api.config().then(cfg => {
    if (!cfg.guildRequired) return;
    const note = document.createElement("p");
    note.className = "hint";
    note.innerHTML = cfg.inviteUrl
      ? `Logging in needs you to be in our Discord server. <a href="${esc(cfg.inviteUrl)}" target="_blank" rel="noopener noreferrer"><b>Join the server</b></a>`
      : "Logging in needs you to be in our Discord server.";
    hint.after(note);
  }).catch(() => { /* the page works without it */ });

  if (notice) history.replaceState(null, "", location.pathname);
  return () => { window.clearTimeout(timer); stopStats(); };
}
