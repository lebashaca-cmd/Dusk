import { icon } from "../ui/icons";
import { esc } from "../util/dom";
import { clamp, fmtTime } from "../util/format";
import { activeLine, lyricsMessage } from "../media/lyrics";
import type { NowPlaying } from "../media/nowplaying";

/** Only touches the page when the text really changed, so a tick that changes nothing costs nothing. */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export interface NowCardOptions {
  showProgress: boolean;
  showLyrics: boolean;
}

/** The small card with the cover, title, controls, progress bar and the current lyric line. */
export function nowCardHTML(np: NowPlaying, o: NowCardOptions): string {
  const art = np.coverUrl
    ? `<img class="np-art" src="${esc(np.coverUrl)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="np-art">${icon("music")}</span>`;
  const label = np.source === "spotify" ? "Listening on Spotify" : "Now playing";
  const c = np.controls;
  const side = c
    ? `<div class="np-ctrls">
        ${c.multiple ? `<button class="np-btn" type="button" data-act="prev" aria-label="Previous song">${icon("prevFill")}</button>` : ""}
        <button class="np-btn main" type="button" data-act="toggle" aria-label="Play or pause">${icon("playFill", "i-play")}${icon("pauseFill", "i-pause")}</button>
        ${c.multiple ? `<button class="np-btn" type="button" data-act="next" aria-label="Next song">${icon("nextFill")}</button>` : ""}
      </div>`
    : `<div class="eq" aria-hidden="true"><i></i><i></i><i></i></div>`;
  const title = np.link
    ? `<a class="np-title" href="${esc(np.link)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">${esc(np.title)}</a>`
    : `<span class="np-title">${esc(np.title)}</span>`;
  return `<div class="np-card" data-np="${np.source}" data-source="${np.source}">
    <div class="np-top">${art}
      <div class="np-info"><span class="np-label"><i></i>${label}</span>${title}<span class="np-artist">${esc(np.artist)}</span></div>
      ${side}
    </div>
    ${np.source === "spotify" && np.link ? `<a class="np-open" href="${esc(np.link)}" target="_blank" rel="noopener noreferrer">${icon("spotify")}<span>Go to Spotify</span></a>` : ""}
    ${o.showProgress ? `<div class="np-prog"><span data-cur>0:00</span><div class="np-hit"${c ? " data-seek" : ""}><div class="np-bar"><div class="np-fill"></div></div></div><span>${fmtTime(np.durationMs)}</span></div>` : ""}
    ${o.showLyrics ? `<button class="np-lyr" type="button" data-lyr aria-label="Open lyrics"><span class="np-lyr-now"></span><span class="np-lyr-next"></span>${icon("expand", "np-exp")}</button>` : ""}
  </div>`;
}

/** Update the parts of a card that move: progress, time, play state and the lyric line. */
export function tickNowCard(el: HTMLElement, np: NowPlaying): void {
  const pos = clamp(np.positionMs(), 0, np.durationMs);
  el.classList.toggle("is-playing", np.isPlaying());
  const fill = el.querySelector<HTMLElement>(".np-fill");
  if (fill) fill.style.transform = `scaleX(${(pos / Math.max(1, np.durationMs)).toFixed(4)})`;
  const cur = el.querySelector<HTMLElement>("[data-cur]");
  if (cur) setText(cur, fmtTime(pos));
  const now = el.querySelector<HTMLElement>(".np-lyr-now");
  const next = el.querySelector<HTMLElement>(".np-lyr-next");
  if (now && next) {
    const l = np.lyrics();
    if (l && l.status === "synced") {
      const i = activeLine(l.lines, pos / 1000);
      setText(now, i >= 0 ? (l.lines[i]?.text ?? "") : "♪");
      setText(next, l.lines[i + 1]?.text ?? "");
    } else {
      setText(now, lyricsMessage(l) || "");
      setText(next, "");
    }
  }
}
