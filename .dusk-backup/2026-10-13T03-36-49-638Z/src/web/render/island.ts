import { clamp, fmtTime } from "../util/format";
import { esc } from "../util/dom";
import { activeLine, lyricsMessage } from "../media/lyrics";
import type { NowPlaying } from "../media/nowplaying";
import { player } from "../media/player";

/* The Dynamic Island music pill (from the supplied component), written without React, plus a lyrics area. */

const WAVE = [3, 5, 7, 10, 8, 12, 14, 11, 13, 12, 14, 13, 11, 14, 12, 13, 14, 12, 13, 11, 14, 12, 13, 11, 12, 10, 8, 6, 4, 2];
const DEFAULT_COLOR = "52 53 58";

const SKIP = (flip: boolean): string => `<svg width="30" height="20" viewBox="0 0 30 20" fill="currentColor"${flip ? ' style="transform:rotate(180deg)"' : ""}><path d="M14 3.2v13.6c0 .9-1 1.4-1.7.9L2.9 10.9a1.1 1.1 0 0 1 0-1.8l9.4-6.8c.7-.5 1.7 0 1.7.9ZM28 3.2v13.6c0 .9-1 1.4-1.7.9l-9.4-6.8a1.1 1.1 0 0 1 0-1.8l9.4-6.8c.7-.5 1.7 0 1.7.9Z"/></svg>`;
const PLAY = `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.6v14.8c0 .8.9 1.3 1.6.9l12-7.4a1 1 0 0 0 0-1.8l-12-7.4A1 1 0 0 0 7 4.6Z"/></svg>`;
const PAUSE = `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1.5"/><rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>`;
const VOL = (muted: boolean): string => `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9.5v5a1 1 0 0 0 1 1h3l4.3 3.7a1 1 0 0 0 1.7-.8V5.6a1 1 0 0 0-1.7-.8L7 8.5H4a1 1 0 0 0-1 1Z"/>${muted
  ? '<path d="m16.5 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>'
  : '<path d="M16 8.5a5 5 0 0 1 0 7M18.7 5.8a9 9 0 0 1 0 12.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>'}</svg>`;
const NOTE = `<svg width="55%" height="55%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="18" r="4"/><path d="M12 18V2l7 4"/></svg>`;

/** The most common color of a cover, as "r g b", for the little waveform highlight. */
function coverColor(url: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 40;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(DEFAULT_COLOR);
        ctx.drawImage(img, 0, 0, 40, 40);
        const px = ctx.getImageData(0, 0, 40, 40).data;
        const groups = new Map<string, { n: number; r: number; g: number; b: number }>();
        for (let i = 0; i < px.length; i += 4) {
          if ((px[i + 3] ?? 0) < 128) continue;
          const key = `${(px[i] ?? 0) >> 5},${(px[i + 1] ?? 0) >> 5},${(px[i + 2] ?? 0) >> 5}`;
          const g = groups.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
          g.n++; g.r += px[i] ?? 0; g.g += px[i + 1] ?? 0; g.b += px[i + 2] ?? 0;
          groups.set(key, g);
        }
        const top = [...groups.values()].sort((a, b) => b.n - a.n)[0];
        resolve(top ? [top.r, top.g, top.b].map(v => Math.round(v / top.n)).join(" ") : DEFAULT_COLOR);
      } catch { resolve(DEFAULT_COLOR); }
    };
    img.onerror = () => resolve(DEFAULT_COLOR);
    img.src = url;
  });
}

export interface IslandOptions {
  showLyrics: boolean;
  /** Called when the person opens or closes the island. */
  onToggle(open: boolean): void;
}

/** Collapsed it is a small pill with the cover and a waveform. Open, it has controls and the lyrics. */
export class IslandPanel {
  readonly el: HTMLElement;
  private np: NowPlaying;
  private showLyrics: boolean;
  private open = false;
  private dragging = false;
  private swipe: { y: number; t: number } | null = null;
  private volumeBeforeMute = 0.35;
  private lines: HTMLElement[] = [];
  private lyricSig = "";
  private lastLine = -2;
  private metaKey = "";
  private readonly island: HTMLElement;
  private readonly onDocDown: (e: PointerEvent) => void;

  constructor(np: NowPlaying, private readonly o: IslandOptions) {
    this.np = np;
    this.showLyrics = o.showLyrics;
    const root = document.createElement("div");
    root.className = "di-root";
    root.innerHTML = `<div class="di-island">
      <button class="di-trigger" type="button" aria-label="Open music controls" aria-expanded="false"></button>
      <span class="di-art"></span>
      <span class="di-wave-anchor"><span class="di-wave">${WAVE.map((h, i) => `<i style="--bar-height:${h}px;--bar-delay:${i * -0.08}s"></i>`).join("")}</span></span>
      <div class="di-player" inert>
        <div class="di-meta"><strong></strong><span></span></div>
        <div class="di-bottom">
          <label class="di-progress"><span data-cur>0:00</span><input type="range" aria-label="Song progress" min="0" max="1" step=".1" value="0"><span data-left>-0:00</span></label>
          <div class="di-controls">
            <button type="button" data-act="prev" aria-label="Previous song">${SKIP(false)}</button>
            <button type="button" data-act="toggle" aria-label="Play or pause"></button>
            <button type="button" data-act="next" aria-label="Next song">${SKIP(true)}</button>
          </div>
          <div class="di-volume">
            <button type="button" data-act="mute" aria-label="Mute"></button>
            <input type="range" aria-label="Music volume" min="0" max="1" step=".05">
          </div>
        </div>
        <div class="di-lyrics" aria-label="Lyrics"><div class="di-lyr-track"></div></div>
      </div>
    </div>`;
    this.el = root;
    this.island = root.querySelector<HTMLElement>(".di-island")!;
    this.bind();
    this.onDocDown = e => { if (this.open && !root.contains(e.target as Node)) this.o.onToggle(false); };
    document.addEventListener("pointerdown", this.onDocDown);
    this.update(np, this.showLyrics);
  }

  destroy(): void {
    document.removeEventListener("pointerdown", this.onDocDown);
    this.el.remove();
  }

  setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    const trigger = this.q<HTMLButtonElement>(".di-trigger");
    this.island.classList.toggle("is-expanded", open);
    this.island.classList.toggle("has-lyrics", open && this.showLyrics);
    trigger.disabled = open;
    trigger.tabIndex = open ? -1 : 0;
    trigger.setAttribute("aria-expanded", String(open));
    const player = this.q(".di-player");
    if (open) player.removeAttribute("inert"); else player.setAttribute("inert", "");
    if (open) this.q<HTMLElement>(".di-controls button").focus({ preventScroll: true });
    this.lastLine = -2;
    this.tick();
  }

  /** Called whenever the stage redraws, with the freshest song state. */
  update(np: NowPlaying, showLyrics: boolean): void {
    this.np = np;
    this.showLyrics = showLyrics;
    this.island.classList.toggle("has-lyrics", this.open && showLyrics);
    const live = np.controls !== null;
    this.island.classList.toggle("is-readonly", !live);

    const key = `${np.key}|${np.coverUrl ?? ""}`;
    if (key !== this.metaKey) {
      this.metaKey = key;
      const art = this.q(".di-art");
      art.innerHTML = np.coverUrl
        ? `<img class="di-cover" src="${esc(np.coverUrl)}" alt="" referrerpolicy="no-referrer">`
        : `<div class="di-cover di-cover-empty">${NOTE}</div>`;
      art.querySelector("img")?.addEventListener("error", () => { art.innerHTML = `<div class="di-cover di-cover-empty">${NOTE}</div>`; });
      this.q(".di-meta strong").textContent = np.title;
      this.q(".di-meta strong").title = np.title;
      this.q(".di-meta span").textContent = np.artist;
      this.island.style.setProperty("--di-color-1", DEFAULT_COLOR);
      if (np.coverUrl) {
        const wanted = key;
        void coverColor(np.coverUrl).then(c => { if (wanted === this.metaKey) this.island.style.setProperty("--di-color-1", c); });
      }
    }
    const vol = this.q<HTMLInputElement>(".di-volume input");
    if (!this.dragging) vol.value = String(player.audio.volume);
    this.q(".di-volume").hidden = !live;
    this.renderLyrics();
    this.tick();
  }

  tick(): void {
    const np = this.np;
    const pos = clamp(np.positionMs(), 0, np.durationMs);
    const playing = np.isPlaying();
    this.q(".di-wave").classList.toggle("is-playing", playing);
    const toggleBtn = this.q("[data-act=toggle]");
    if (toggleBtn.dataset.state !== String(playing)) { toggleBtn.dataset.state = String(playing); toggleBtn.innerHTML = playing ? PAUSE : PLAY; }
    const vol = player.audio.volume;
    const muteBtn = this.q("[data-act=mute]");
    if (muteBtn.dataset.state !== String(vol === 0)) { muteBtn.dataset.state = String(vol === 0); muteBtn.innerHTML = VOL(vol === 0); }
    const bar = this.q<HTMLInputElement>(".di-progress input");
    bar.max = String(Math.max(1, np.durationMs / 1000));
    bar.disabled = np.controls === null;
    if (!this.dragging) bar.value = String(pos / 1000);
    bar.style.setProperty("--progress", `${(pos / Math.max(1, np.durationMs)) * 100}%`);
    const cur = this.q("[data-cur]");
    const left = this.q("[data-left]");
    const curText = fmtTime(pos);
    const leftText = `-${fmtTime(Math.max(0, np.durationMs - pos))}`;
    if (cur.textContent !== curText) cur.textContent = curText;
    if (left.textContent !== leftText) left.textContent = leftText;
    const volInput = this.q<HTMLInputElement>(".di-volume input");
    volInput.style.setProperty("--progress", `${vol * 100}%`);
    this.q("[data-act=prev]").toggleAttribute("disabled", !np.controls);
    this.q("[data-act=next]").toggleAttribute("disabled", !np.controls);
    this.q("[data-act=toggle]").toggleAttribute("disabled", !np.controls);
    this.moveLyrics(pos);
  }

  /* ---------- lyrics ---------- */

  private renderLyrics(): void {
    const l = this.np.lyrics();
    const sig = `${this.np.key}|${l ? `${l.status}:${l.lines.length}:${l.plain.length}` : "loading"}`;
    if (sig === this.lyricSig) return;
    this.lyricSig = sig;
    const area = this.q(".di-lyrics");
    const track = this.q(".di-lyr-track");
    this.lastLine = -2;
    area.classList.remove("plain");
    if (l?.status === "synced") {
      track.innerHTML = l.lines.map(x => `<div class="di-line">${esc(x.text) || "♪"}</div>`).join("");
      this.lines = Array.from(track.querySelectorAll<HTMLElement>(".di-line"));
    } else if (l?.status === "plain" && l.plain.trim()) {
      area.classList.add("plain");
      track.style.transform = "";
      track.innerHTML = `<div class="di-plain">${esc(l.plain)}</div>`;
      this.lines = [];
    } else {
      track.style.transform = "";
      track.innerHTML = `<div class="di-line msg">${esc(lyricsMessage(l))}</div>`;
      this.lines = [];
    }
  }

  private moveLyrics(posMs: number): void {
    const l = this.np.lyrics();
    if (!this.lines.length || l?.status !== "synced" || !this.open) return;
    const i = activeLine(l.lines, posMs / 1000);
    if (i === this.lastLine) return;
    this.lastLine = i;
    this.lines.forEach((line, n) => line.classList.toggle("cur", n === i));
    const target = this.lines[Math.max(0, i)];
    if (!target) return;
    const area = this.q(".di-lyrics");
    const track = this.q(".di-lyr-track");
    track.style.transform = `translateY(${area.clientHeight / 2 - (target.offsetTop + target.offsetHeight / 2)}px)`;
  }

  /* ---------- events ---------- */

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.el.querySelector<T>(selector)!;
  }

  private bind(): void {
    const el = this.el;
    this.q(".di-trigger").addEventListener("click", () => this.o.onToggle(true));
    el.addEventListener("keydown", e => { if (e.key === "Escape" && this.open) this.o.onToggle(false); });

    el.addEventListener("click", e => {
      const btn = (e.target as Element).closest<HTMLElement>("[data-act]");
      const c = this.np.controls;
      if (!btn || !c) return;
      const act = btn.dataset.act;
      if (act === "toggle") c.toggle();
      else if (act === "prev") c.prev();
      else if (act === "next") c.next();
      else if (act === "mute") {
        const a = player.audio;
        if (a.volume) { this.volumeBeforeMute = a.volume; a.volume = 0; } else a.volume = this.volumeBeforeMute || 0.35;
        this.tick();
      }
    });

    const bar = this.q<HTMLInputElement>(".di-progress input");
    bar.addEventListener("pointerdown", () => { this.dragging = true; });
    bar.addEventListener("input", () => { this.np.controls?.seek(Number(bar.value) * 1000); this.tick(); });
    for (const ev of ["pointerup", "pointercancel", "change"]) bar.addEventListener(ev, () => { this.dragging = false; });

    const vol = this.q<HTMLInputElement>(".di-volume input");
    vol.addEventListener("input", () => { player.audio.volume = Number(vol.value); this.tick(); });

    // Swipe up on the open island to close it, like on a phone.
    this.island.addEventListener("pointerdown", e => {
      if (!this.open || e.button !== 0 || (e.target as Element).closest("button, input")) return;
      this.swipe = { y: e.clientY, t: e.timeStamp };
      this.island.setPointerCapture(e.pointerId);
    });
    this.island.addEventListener("pointerup", e => {
      if (!this.swipe) return;
      const dist = e.clientY - this.swipe.y;
      const speed = dist / Math.max(1, e.timeStamp - this.swipe.t);
      this.swipe = null;
      if (dist < -36 || speed < -0.35) this.o.onToggle(false);
    });
    this.island.addEventListener("pointercancel", () => { this.swipe = null; });
  }
}
