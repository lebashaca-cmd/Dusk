import { icon } from "../ui/icons";
import { esc } from "../util/dom";
import { clamp, fmtTime } from "../util/format";
import { activeLine, lyricsMessage } from "../media/lyrics";
import { lineHTML, lineSpan, paintLines, sweepLine } from "./lyrfx";
import type { NowPlaying } from "../media/nowplaying";

/** What decides whether the panel has to be drawn again (as opposed to just moved along). */
export function panelSignature(np: NowPlaying): string {
  const l = np.lyrics();
  return `${np.key}|${l ? `${l.status}:${l.lines.length}:${l.plain.length}` : "loading"}`;
}

/** The big lyrics panel: blurred cover background, the song, and lines that scroll as it plays. */
export class LyricPanel {
  readonly el: HTMLElement;
  private readonly track: HTMLElement | null;
  private readonly body: HTMLElement | null;
  private lines: HTMLElement[] = [];
  private last = -2;

  constructor(private readonly np: NowPlaying, readonly signature: string, onClose: () => void) {
    const l = np.lyrics();
    const synced = l?.status === "synced";
    const plain = l?.status === "plain" && l.plain.trim();

    let content: string;
    if (synced && l) content = `<div class="lyr-body"><div class="lyr-track">${l.lines.map(x => `<div class="lyr-line">${lineHTML(x.text)}</div>`).join("")}</div></div>`;
    else if (plain && l) content = `<div class="lyr-plain">${esc(l.plain)}</div>`;
    else content = `<div class="lyr-body"><div class="lyr-track"><div class="lyr-line msg">${esc(lyricsMessage(l))}</div></div></div>`;

    const el = document.createElement("aside");
    el.className = "lyr-panel";
    el.setAttribute("aria-label", "Lyrics");
    el.innerHTML = `<div class="lyr-bg"></div><div class="lyr-shade"></div>
      <div class="lyr-head">
        ${np.coverUrl ? `<img src="${esc(np.coverUrl)}" alt="" referrerpolicy="no-referrer">` : ""}
        <div class="lyr-meta"><b>${esc(np.title)}</b><span>${esc(np.artist)}</span></div>
        ${np.link ? `<a class="lyr-btn lyr-open" href="${esc(np.link)}" target="_blank" rel="noopener noreferrer" aria-label="Go to Spotify" title="Go to Spotify">${icon(np.source === "spotify" ? "spotify" : "arrow")}</a>` : ""}
        <button class="lyr-btn" type="button" data-close aria-label="Close lyrics">${icon("close")}</button>
      </div>
      ${content}
      <div class="lyr-foot"><span data-cur>0:00</span><div class="np-bar"><div class="np-fill"></div></div><span>${fmtTime(np.durationMs)}</span></div>`;
    if (np.coverUrl) el.querySelector<HTMLElement>(".lyr-bg")!.style.backgroundImage = `url(${JSON.stringify(np.coverUrl)})`;
    el.querySelector("[data-close]")?.addEventListener("click", onClose);
    if (plain) el.querySelector(".lyr-body")?.classList.add("plain");

    this.el = el;
    this.track = el.querySelector<HTMLElement>(".lyr-track");
    this.body = el.querySelector<HTMLElement>(".lyr-body");
    if (synced) this.lines = Array.from(el.querySelectorAll<HTMLElement>(".lyr-line"));
  }

  tick(): void {
    const np = this.np;
    const pos = clamp(np.positionMs(), 0, np.durationMs);
    const fill = this.el.querySelector<HTMLElement>(".np-fill");
    if (fill) fill.style.transform = `scaleX(${(pos / Math.max(1, np.durationMs)).toFixed(4)})`;
    const cur = this.el.querySelector<HTMLElement>("[data-cur]");
    if (cur && cur.textContent !== fmtTime(pos)) cur.textContent = fmtTime(pos);

    const l = np.lyrics();
    if (!this.lines.length || !l || !this.track || !this.body) return;
    const i = activeLine(l.lines, pos / 1000);
    if (i === this.last) return;
    this.last = i;
    paintLines(this.lines, i);
    if (i >= 0) sweepLine(this.lines[i], pos / 1000 - (l.lines[i]?.t ?? 0), lineSpan(l.lines.map(x => x.t), i));
    const target = this.lines[Math.max(0, i)];
    if (!target) return;
    const offset = this.body.clientHeight / 2 - (target.offsetTop + target.offsetHeight / 2);
    this.track.style.transform = `translateY(${Math.min(this.body.clientHeight * 0.3, offset)}px)`;
  }
}
