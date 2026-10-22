import { LIMITS, THEMES } from "../../shared/constants";
import { THEME_KEYS } from "../../shared/types";
import { USERNAME_HELP, checkUsernameFormat, cleanUsername } from "../../shared/url";
import { api } from "../api";
import { demoModel } from "../render/demo";
import { Stage } from "../render/stage";
import { store } from "../state";
import { SKY, siteFooter, siteNav } from "../ui/chrome";
import { icon } from "../ui/icons";
import { esc, must } from "../util/dom";

const FEATURES: ReadonlyArray<{ icon: string; title: string; text: string }> = [
  { icon: "discord", title: "Discord login", text: "One click. We read your name and your picture, and nothing else." },
  { icon: "gamepad", title: "Live status", text: "Your Discord status, the game you are playing and your Spotify song update as they change." },
  { icon: "music", title: "Your own music", text: "Upload MP3s and type the song and artist. The cover comes from the file, the lyrics from LRCLIB." },
  { icon: "play", title: "Lyrics that follow along", text: "Synced lyrics scroll with the song, in a side panel or in a Dynamic Island above the page." },
  { icon: "star", title: "Roles as tags", text: "Your roles in our Discord server show up as tags. Hide the ones you would rather not show." },
  { icon: "layers", title: "Groups of links", text: "Put your links under headings, like Work or Elsewhere. Links with no heading sit at the top." },
  { icon: "chart", title: "Who is looking", text: "How many people opened your page, which days they came, and which links they actually clicked." },
  { icon: "heart", title: "A look you chose", text: "Twelve themes, seventeen backgrounds, fonts that react to your cursor and real logos for every link." },
];

const STEPS: ReadonlyArray<{ title: string; text: string }> = [
  { title: "Pick a name", text: "Type the name you want above. It becomes your link, and it is yours as long as you keep it." },
  { title: "Log in with Discord", text: "One click. Your Discord picture and name fill the page in, and your live status can follow." },
  { title: "Build your page", text: "Add links, upload a song, pick a theme, and share your link wherever you like." },
];

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  { q: "Why do I log in with Discord?", a: "It proves the name is yours, gives your page your Discord picture and name, and lets us show your live status and your server roles." },
  { q: "How does the live status work?", a: "It uses Lanyard, a free service. Join the Lanyard Discord server with the same account, then turn on live status in the dashboard." },
  { q: "Where do the lyrics come from?", a: "From LRCLIB, a free open lyrics database. If it has no lyrics for a song, the page says so instead of guessing." },
  { q: "What do you store about me?", a: "Your Discord name and picture, what you put on your page, and your IP address and the time you signed up. The IP and sign-up time are kept for abuse prevention and are never shown on your page." },
  { q: "Can I see who looked at my page?", a: "You can see how many people opened it, which days they came, and which links they clicked. You cannot see who they are, and the numbers are only ever about your own page." },
  { q: "What can I upload?", a: `MP3 files up to ${Math.round(LIMITS.audioBytes / 1024 / 1024)} MB, and up to ${LIMITS.tracks} songs per page.` },
  { q: "Can I have more than one page?", a: `Yes. Owners and developers can make up to ${"several"} pages on one account, each with its own links, songs and style.` },
];

function sectionsHTML(loggedIn: boolean): string {
  const themes = THEME_KEYS.map(k => {
    const t = THEMES[k];
    return `<div class="theme-chip"><i style="background:linear-gradient(135deg,${t.colors.bg},${t.colors.bg2});--ac:${t.colors.accent}"></i><span>${esc(t.name)}</span></div>`;
  }).join("");
  return `<section class="band" id="features" aria-labelledby="h-features">
      <p class="eyebrow">what's on it</p>
      <h2 id="h-features">Everything on one page</h2>
      <p class="band-sub">One link to give people. It holds your links, your status, your music and your look, and it all updates while it is open.</p>
      <div class="feature-grid">${FEATURES.map(f => `<article class="feature"><span class="fi">${icon(f.icon)}</span><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></article>`).join("")}</div>
    </section>
    <section class="band" id="how" aria-labelledby="h-how">
      <p class="eyebrow">three steps</p>
      <h2 id="h-how">How it works</h2>
      <ol class="steps">${STEPS.map((s, i) => `<li><b>${String(i + 1).padStart(2, "0")}</b><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join("")}</ol>
    </section>
    <section class="band" id="themes" aria-labelledby="h-themes">
      <p class="eyebrow">start somewhere</p>
      <h2 id="h-themes">Twelve themes to begin with</h2>
      <p class="band-sub">Then change any colour, font or background yourself. Seventeen backgrounds, and every choice is yours, saved as you make it.</p>
      <div class="theme-row">${themes}</div>
    </section>
    <section class="band narrow" id="faq" aria-labelledby="h-faq">
      <p class="eyebrow">questions</p>
      <h2 id="h-faq">The short answers</h2>
      ${FAQ.map(f => `<details class="faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}
    </section>
    <section class="band cta">
      <h2>Ready when you are</h2>
      <p class="band-sub">It takes about a minute, and the page is yours the whole time.</p>
      ${loggedIn ? `<a class="btn-primary" href="/dashboard" data-link>Open dashboard</a>` : `<button class="btn-primary" type="button" id="to-top">Claim your name</button>`}
    </section>`;
}

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
        <a class="btn-primary" href="/dashboard" data-link>Open dashboard</a>
      </div>`
    : `<form class="claim" id="claim" autocomplete="off">
        <label class="claim-field"><span class="pre">${esc(location.host)}/</span><input id="name" name="name" placeholder="yourname" maxlength="20" spellcheck="false" autocapitalize="none" aria-label="Username"></label>
        <button class="btn-primary" id="go" type="submit">Claim</button>
      </form>
      <p class="hint" id="hint" role="status" aria-live="polite">${esc(notice) || "Pick a name, then continue with Discord."}</p>`;

  root.innerHTML = `<div class="home">
    ${SKY}
    ${siteNav({ loggedIn: !!me })}
    <main>
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">a page for everything you</p>
          <h1 class="wordmark">dusk</h1>
          <p class="lede">One page for your links, your Discord status and your music — with lyrics that follow the song, and a look you actually chose.</p>
          ${action}
          <ul class="hero-points">
            <li>${icon("discord")}Discord login</li>
            <li>${icon("gamepad")}Live presence</li>
            <li>${icon("music")}Synced lyrics</li>
            <li>${icon("chart")}Page insights</li>
          </ul>
        </div>
        <aside class="demo" aria-label="Preview">
          <div class="device" id="device"></div>
          <p class="cap">${me ? `This is your page. <a href="/dashboard" data-link>Edit it in the dashboard</a>` : "This is a page. Yours will look like this, only yours."}</p>
        </aside>
      </section>
      ${sectionsHTML(!!me)}
    </main>
    ${siteFooter()}
  </div>`;

  // Sections fade up as they scroll into view.
  const reveal = "IntersectionObserver" in window
    ? new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add("in"); reveal?.unobserve(en.target); }
    }), { threshold: 0.12 })
    : null;
  root.querySelectorAll<HTMLElement>(".band h2, .band .band-sub, .feature, .steps li, .theme-chip, .faq, .cta > *, .stats > div").forEach(el => {
    el.setAttribute("data-reveal", "");
    const sibling = el.parentElement ? Array.from(el.parentElement.children).indexOf(el) : 0;
    el.style.setProperty("--d", `${Math.min(sibling, 6) * 60}ms`);
    if (reveal) reveal.observe(el); else el.classList.add("in");
  });

  // The phone shows a real page: the person's own if they are signed in, a made-up one otherwise.
  let stage: Stage | null = null;
  const model = me ? store.model : demoModel();
  if (model) {
    stage = new Stage(model, { width: 330 });
    must("#device", root).append(stage.el);
  }

  // "Risk" links to the Discord server from DISCORD_INVITE_URL. Without one it is plain text.
  const credit = must<HTMLAnchorElement>("#credit-link", root);
  credit.removeAttribute("href");
  api.config().then(c => { if (c.creditUrl && alive) credit.href = c.creditUrl; }).catch(() => { /* stays plain text */ });

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

  if (me) return () => { reveal?.disconnect(); stopStats(); stage?.destroy(); };
  root.querySelector("#to-top")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    window.setTimeout(() => root.querySelector<HTMLInputElement>("#name")?.focus(), 350);
  });

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
  return () => { window.clearTimeout(timer); reveal?.disconnect(); stopStats(); stage?.destroy(); };
}
