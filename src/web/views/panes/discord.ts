import { lanyard } from "../../media/lanyard";
import { store } from "../../state";
import { esc } from "../../util/dom";
import { delegate } from "../../util/dom";
import { LYRIC_STYLES } from "../../../shared/types";
import { bindFields, group, selectField, toggle, type Pane } from "./fields";

export const discordPane: Pane = {
  id: "discord",
  label: "Discord",
  mount(el) {
    const u = store.me!.user;
    const dev = u.id.startsWith("dev-");
    const draw = (): void => {
      const d = store.profile.discord;
      el.innerHTML = [
        group("Your Discord account",
          `<div class="acct">${u.discordAvatarUrl ? `<img src="${esc(u.discordAvatarUrl)}" alt="" referrerpolicy="no-referrer">` : `<span class="wl">${esc(u.discordName.charAt(0).toUpperCase())}</span>`}
            <div><b>${esc(u.discordName)}</b><small>Logged in with Discord${dev ? " (test login)" : ""}</small></div></div>`),
        group("Live status",
          `<div class="banner" id="status" role="status"></div>
           <button class="btn-ghost" type="button" id="retry" style="justify-content:center">Try again</button>
           <p class="note">Status, games and Spotify come from <a href="https://discord.gg/lanyard" target="_blank" rel="noopener noreferrer">Lanyard</a>, a free service. Join its Discord server with the account you logged in with, or nothing can be shown. Turning this on makes your Discord user ID visible in your page's data, which is how visitors' browsers look you up.</p>` +
          toggle("discord.enabled", "Show my live Discord status", d.enabled) +
          `<p class="note">The dot under your picture follows your real Discord status on its own: green for online, yellow for idle, red for do not disturb, grey for offline.</p>`),
        d.enabled ? group("What to show",
          toggle("discord.showCard", "Discord card", d.showCard) +
          toggle("discord.showActivity", "The game or app I'm using", d.showActivity) +
          toggle("discord.showSpotify", "Spotify card when I'm listening", d.showSpotify) +
          (d.showSpotify ? toggle("discord.showProgress", "Spotify progress bar", d.showProgress) + toggle("discord.showLyrics", "Spotify lyrics (from LRCLIB)", d.showLyrics) + selectField("discord.lyricsStyle", "Lyrics style", d.lyricsStyle, LYRIC_STYLES.map(s => [s, s === "panel" ? "Panel beside the card" : "Dynamic Island"] as const)) + toggle("discord.lyricsOpen", "Open lyrics by default", d.lyricsOpen) : "")) : "",
      ].join("");
      paint();
    };
    const paint = (): void => {
      const s = el.querySelector<HTMLElement>("#status");
      if (!s) return;
      const on = store.profile.discord.enabled;
      s.className = `banner ${on ? lanyard.status : ""}`.trim();
      s.textContent = !on ? "Live status is off." : dev ? "Test logins have no real Discord account, so there is nothing to show." : lanyard.message || "Waiting…";
    };
    draw();
    const offs = [
      bindFields(el, path => path === "discord.enabled" || path === "discord.showSpotify", draw),
      lanyard.subscribe(paint),
      delegate(el, "click", "#retry", () => lanyard.reconnect()),
    ];
    return () => offs.forEach(fn => fn());
  },
};
