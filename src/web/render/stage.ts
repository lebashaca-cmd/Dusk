import { PRESENCE_COLORS } from "../../shared/constants";
import type { LyricStyle, RenderModel } from "../../shared/types";
import { lanyard, type PresenceData } from "../media/lanyard";
import { onLyricsLoaded } from "../media/lyrics";
import { spotifyNowPlaying, uploadNowPlaying, type NowPlaying } from "../media/nowplaying";
import { player } from "../media/player";
import { copyText } from "../ui/toast";
import { delegate } from "../util/dom";
import { GridField, ParticleField } from "./background";
import { bioLines, cardHTML } from "./card";
import { kindOf } from "../../shared/constants";
import { isVideoUrl } from "../../shared/url";
import { applyBoxLook, boxInner, fitFree, freeHTML, railHTML } from "./free";
import { watchMotion } from "./motion";
import { IslandPanel } from "./island";
import { LyricPanel, panelSignature } from "./lyricpanel";
import { nowCardHTML, tickNowCard } from "./nowcard";
import { presenceCardHTML } from "./presence";
import { applyTheme } from "./theme";
import { startTypewriter } from "./typewriter";

export interface StageOptions {
  /** Fixed card width, used by the preview frame. */
  width?: number;
}

type Source = NowPlaying["source"];

/** What both lyrics styles offer the stage. */
interface LyricView {
  readonly el: HTMLElement;
  readonly signature: string;
  tick(): void;
}

/**
 * A themed profile page that fills its container. Call `update` whenever the model changes;
 * parts that move on their own (music, Discord) keep running across updates.
 */
export class Stage {
  readonly el: HTMLElement;
  private readonly mount: HTMLElement;
  private readonly wrap: HTMLElement;
  private readonly field: ParticleField;
  private readonly grid: GridField;
  private model: RenderModel;
  private readonly cleanups: Array<() => void> = [];
  private stopTyping: () => void = () => {};
  private panel: LyricView | null = null;
  private island: IslandPanel | null = null;
  private islandSource: Source | null = null;
  private openLyrics: Source | null = null;
  private lyricsDecided = false;
  private spotifyOn = false;
  private introTimer = 0;
  private slotTimer = 0;
  private entrance = "";
  private nowPlaying = new Map<Source, NowPlaying>();
  private tickTimer = 0;
  private resize: ResizeObserver | null = null;
  private boxes: ResizeObserver | null = null;
  private tilt = { x: 0, y: 0 };
  private tiltTo = { x: 0, y: 0 };
  private tiltRaf = 0;

  constructor(model: RenderModel, private readonly opts: StageOptions = {}) {
    this.model = model;
    const el = document.createElement("div");
    el.className = "stage";
    el.innerHTML = `<div class="fx-img"></div><video class="fx-vid" muted loop playsinline preload="auto" aria-hidden="true"></video><div class="fx-bg"></div><div class="fx-aurora"><i></i><i></i><i></i></div><canvas class="fx-canvas fx-particles"></canvas><canvas class="fx-canvas fx-grid"></canvas><div class="fx-dim"></div><div class="scroll"><div class="wrap"><div class="mount"></div></div></div>`;
    this.el = el;
    // Entrance animations only run for the first moments, so edits in the dashboard never replay them.
    el.classList.add("is-intro");
    this.introTimer = window.setTimeout(() => el.classList.remove("is-intro"), 1600);
    this.mount = el.querySelector<HTMLElement>(".mount")!;
    this.wrap = el.querySelector<HTMLElement>(".wrap")!;

    // Backgrounds are a choice the owner made on purpose, so they move whatever the system says about animations.
    const reduce = false;
    this.field = new ParticleField(
      el.querySelector<HTMLCanvasElement>(".fx-particles")!,
      el,
      () => this.model.profile.bgType === "particles",
      () => this.model.profile.colors.accent,
      reduce,
      () => this.model.profile.density,
    );
    this.grid = new GridField(
      el.querySelector<HTMLCanvasElement>(".fx-grid")!,
      el,
      () => this.model.profile.bgType === "grid",
      () => this.model.profile.colors.accent,
      () => this.model.profile.gridSize,
      () => this.model.profile.gridPush,
      reduce,
    );

    el.addEventListener("pointermove", e => this.onPointer(e));
    el.addEventListener("pointerleave", () => this.onLeave());
    this.cleanups.push(delegate(this.mount, "click", "[data-share]", () =>
      void copyText(`${location.origin}/${this.model.username}`, "Profile link copied")));
    this.cleanups.push(delegate(this.wrap, "click", "[data-act]", (_e, t) => this.onControl(t)));
    this.cleanups.push(delegate(this.wrap, "click", "[data-lyr]", (_e, t) => this.toggleLyrics(this.sourceOf(t))));
    this.cleanups.push(delegate(this.wrap, "click", "[data-seek]", (e, t) => this.onSeek(e as MouseEvent, t)));
    // The page scrolls smoothly when a button sends it somewhere; the visitor taking over stops it. The rail
    // shows which page is on screen.
    const scroller = el.querySelector<HTMLElement>(".scroll");
    if (scroller) {
      // Touch and the keyboard scroll the usual way and take over from any glide in progress.
      const stop = (): void => this.stopScroll();
      scroller.addEventListener("touchstart", stop, { passive: true });
      scroller.addEventListener("keydown", stop);
      // The wheel and the trackpad give the page some weight: it glides to where you scrolled.
      scroller.addEventListener("wheel", e => this.onWheel(e, scroller), { passive: false });
      scroller.addEventListener("scroll", () => {
        if (!this.scrolling) this.pos = scroller.scrollTop;
        this.syncRail();
      }, { passive: true });
    }
    // A button on the free-form page scrolls to the page it points at.
    this.cleanups.push(delegate(this.el, "click", "[data-jump]", (_e, t) => this.jump(t.dataset.jump ?? "top")));
    this.cleanups.push(delegate(this.el, "keydown", "[data-jump]", (e, t) => {
      const k = (e as KeyboardEvent).key;
      if (k === "Enter" || k === " ") { e.preventDefault(); this.jump(t.dataset.jump ?? "top"); }
    }));
    this.cleanups.push(lanyard.subscribe(() => this.renderSlot()));
    this.cleanups.push(player.subscribe(() => this.renderSlot()));
    this.cleanups.push(onLyricsLoaded(() => this.renderSlot()));
    this.tickTimer = window.setInterval(() => this.tick(), 250);
    // The free-form board is scaled to the width it has, so it is fitted again on every resize. The
    // pieces grow and shrink with what is in them (a song starts, the bio is typed), and the board
    // is as tall as its lowest piece, so it is fitted again when any piece changes size.
    if (typeof ResizeObserver !== "undefined") {
      this.resize = new ResizeObserver(() => { fitFree(this.el); this.syncRail(); });
      this.resize.observe(this.el);
      this.boxes = new ResizeObserver(() => { fitFree(this.el); this.syncRail(); });
    }

    this.update(model);
  }

  private scrollAnim = 0;
  /** Whether a glide or a button's scroll is moving the page right now. */
  private scrolling = false;
  /** Where the page is, and where the wheel is taking it, in pixels. */
  private pos = 0;
  private goal = 0;
  /** When the last button scroll started, so the tail of the click's own wheel events do not stop it. */
  private pressedAt = 0;

  private stopScroll(): void {
    cancelAnimationFrame(this.scrollAnim);
    this.scrolling = false;
  }

  /** The wheel and the trackpad: the page eases toward where you scrolled, like it has a weight. */
  private onWheel(e: WheelEvent, scroller: HTMLElement): void {
    if (e.ctrlKey || e.defaultPrevented || e.deltaY === 0 && e.deltaX !== 0) return;
    const max = scroller.scrollHeight - scroller.clientHeight;
    if (max <= 0) return;
    // A piece that scrolls on its own (a tall piece with a fixed height) keeps the wheel while it can use it.
    for (let n = e.target instanceof Element ? e.target : null; n && n !== scroller; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY;
      if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight + 1) {
        const room = e.deltaY < 0 ? n.scrollTop > 0 : n.scrollTop + n.clientHeight < n.scrollHeight - 1;
        if (room) return;
      }
    }
    // A button's scroll is not interrupted by the last of the wheel events that came before the click.
    if (this.scrolling && performance.now() - this.pressedAt < 350) { e.preventDefault(); return; }
    const unit = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? scroller.clientHeight : 1;
    if (!this.scrolling) { this.pos = scroller.scrollTop; this.goal = this.pos; }
    this.goal = Math.max(0, Math.min(max, this.goal + e.deltaY * unit));
    e.preventDefault();
    if (this.scrolling && this.glide) return;
    this.glide = true;
    this.scrolling = true;
    this.vel = 0;
    cancelAnimationFrame(this.scrollAnim);
    let last = performance.now();
    // A spring that is neither bouncy nor sluggish: it starts from rest and builds up speed (the ease in),
    // then slows down gently as it reaches the goal (the ease out). New wheel turns keep its speed.
    const W = 8;
    const step = (now: number): void => {
      let left = Math.min(64, now - last) / 1000;
      last = now;
      while (left > 0) {
        const h = Math.min(left, 1 / 240);
        this.vel += (W * W * (this.goal - this.pos) - 2 * W * this.vel) * h;
        this.pos += this.vel * h;
        left -= h;
      }
      if (Math.abs(this.goal - this.pos) < 0.3 && Math.abs(this.vel) < 6) { this.pos = this.goal; this.vel = 0; }
      if (this.pos < 0 || this.pos > max) { this.pos = Math.max(0, Math.min(max, this.pos)); this.vel = 0; this.goal = this.pos; }
      scroller.scrollTop = this.pos;
      // The page hit the top or the bottom: the spring is done.
      if (this.pos === this.goal) { this.scrolling = false; this.glide = false; return; }
      this.scrollAnim = requestAnimationFrame(step);
    };
    this.scrollAnim = requestAnimationFrame(step);
  }
  private vel = 0;
  private glide = false;

  /** A video as the background: it plays silently on a loop behind the page. */
  private syncVideo(): void {
    const video = this.el.querySelector<HTMLVideoElement>(".fx-vid");
    if (!video) return;
    const p = this.model.profile;
    const src = p.bgType === "image" && isVideoUrl(p.bgImage) ? p.bgImage : "";
    if (!src) {
      if (video.getAttribute("src")) { video.pause(); video.removeAttribute("src"); video.load(); }
      return;
    }
    if (video.getAttribute("src") !== src) {
      video.setAttribute("src", src);
      video.muted = true;
      void video.play().catch(() => {});
    } else if (video.paused) {
      void video.play().catch(() => {});
    }
  }

  /** Scroll smoothly, down or up, slowing in and out. A button asked for it, so it always moves smoothly. */
  private smoothTo(scroller: HTMLElement, target: number): void {
    cancelAnimationFrame(this.scrollAnim);
    this.glide = false;
    const from = scroller.scrollTop;
    const to = Math.max(0, Math.min(target, scroller.scrollHeight - scroller.clientHeight));
    if (Math.abs(to - from) < 2) { scroller.scrollTop = to; this.scrolling = false; this.pos = to; return; }
    const dur = Math.min(1300, 600 + Math.abs(to - from) * 0.3);
    const t0 = performance.now();
    this.scrolling = true;
    this.pressedAt = t0;
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      scroller.scrollTop = from + (to - from) * e;
      this.pos = scroller.scrollTop;
      this.goal = this.pos;
      if (t < 1) this.scrollAnim = requestAnimationFrame(step);
      else this.scrolling = false;
    };
    this.scrollAnim = requestAnimationFrame(step);
  }

  /** Where each page starts, in scroll pixels: the top first, then every page panel from the top down. */
  private pageTops(): number[] {
    const scroller = this.el.querySelector<HTMLElement>(".scroll");
    const free = this.mount.querySelector<HTMLElement>(".free");
    if (!scroller || !free) return [0];
    const stacked = this.el.classList.contains("is-stacked");
    const k = stacked ? 1 : free.getBoundingClientRect().width / (free.offsetWidth || 1);
    const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
    const tops = [...this.mount.querySelectorAll<HTMLElement>('.fbox[data-kind="page"]')]
      .filter(b => b.offsetParent !== null || !stacked)
      .map(b => stacked ? b.getBoundingClientRect().top - base : b.offsetTop * k)
      .sort((a, b) => a - b);
    return [0, ...tops];
  }

  /** Scroll to a page of the board, or to the top. */
  private jump(target: string): void {
    const scroller = this.el.querySelector<HTMLElement>(".scroll");
    if (!scroller) return;
    const box = target === "top" ? null : this.mount.querySelector<HTMLElement>(`.fbox[data-widget="${CSS.escape(target)}"]`);
    if (!box) { this.smoothTo(scroller, 0); return; }
    const tops = this.pageTops();
    const free = this.mount.querySelector<HTMLElement>(".free");
    const stacked = this.el.classList.contains("is-stacked");
    const k = stacked || !free ? 1 : free.getBoundingClientRect().width / (free.offsetWidth || 1);
    const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
    const top = stacked ? box.getBoundingClientRect().top - base : box.offsetTop * k;
    this.smoothTo(scroller, tops.length ? top : 0);
  }

  /** Mark the page that is on screen on every rail. */
  private syncRail(): void {
    const rails = this.el.querySelectorAll<HTMLElement>(".frail");
    if (!rails.length) return;
    const scroller = this.el.querySelector<HTMLElement>(".scroll");
    if (!scroller) return;
    const tops = this.pageTops();
    const bottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4 && scroller.scrollTop > 0;
    let active = 0;
    tops.forEach((t, i) => { if (t <= scroller.scrollTop + scroller.clientHeight * 0.4) active = i; });
    if (bottom) active = tops.length - 1;
    for (const rail of rails) rail.querySelectorAll<HTMLElement>(".frail-i").forEach((b, i) => b.classList.toggle("on", i === active));
  }

  /** A rail docked to the side of the screen stays there while the page scrolls, so it sits outside the board. */
  /** Undoes what the scroll-driven motion of the board set up. */
  private motionOff: (() => void) | null = null;

  private buildDock(free: boolean): void {
    this.el.querySelectorAll(".frail-dock").forEach(d => d.remove());
    if (!free) return;
    const board = this.model.profile.page.board;
    const docked = board.filter(b => kindOf(b.id) === "rail" && (b.dock === "left" || b.dock === "right"));
    for (const box of docked) {
      const d = document.createElement("div");
      d.className = "fbox frail-dock";
      d.dataset.widget = box.id;
      d.dataset.side = box.dock;
      d.dataset.kind = "rail";
      applyBoxLook(d, box);
      d.innerHTML = boxInner(railHTML(board, box));
      this.el.append(d);
    }
    this.syncRail();
  }

  /** Redraw for new data. */
  update(model: RenderModel): void {
    this.model = model;
    const p = model.profile;
    applyTheme(this.el, model, this.opts.width);

    player.setQueue(p.music.enabled ? model.tracks : [], { loop: p.music.loop, volume: p.music.volume });
    lanyard.ensure(p.discord.enabled ? model.discordId : null);

    // Regular is the usual column. Experimental is the free-form board.
    const free = p.page.layout === "experimental";
    this.el.classList.toggle("is-free", free);

    this.syncVideo();
    this.stopTyping();
    this.mount.innerHTML = free ? freeHTML(model, p.page.board) : cardHTML(model);
    this.updateDot();
    this.renderSlot();
    fitFree(this.el);
    this.buildDock(free);
    this.syncRail();
    this.boxes?.disconnect();
    this.motionOff?.();
    this.motionOff = free ? watchMotion(this.el) : null;
    if (free) for (const box of this.mount.querySelectorAll(".fbox-in")) this.boxes?.observe(box);
    if (p.typewriter) this.stopTyping = startTypewriter(this.mount.querySelector<HTMLElement>(".bio-text"), bioLines(p.bio));

    if (p.effects.entrance !== this.entrance) {
      this.entrance = p.effects.entrance;
      this.mount.style.animation = "none";
      void this.mount.offsetWidth;
      this.mount.style.animation = p.effects.entrance === "none" ? "" : `ent-${p.effects.entrance} 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards`;
    }
    // The tilt and the light under the pointer belong to the single card, not to a board.
    if (!p.effects.tilt || free) { this.tiltTo.x = this.tiltTo.y = 0; this.startTilt(); }
  }

  /** Start the uploaded music. Browsers need this to follow a tap. */
  startMusic(): void {
    // Spotify wins: if it is already playing, the uploaded songs stay quiet. (If Spotify shows up a moment later, renderSlot pauses them.)
    if (this.spotifyPlaying()) return;
    if (this.model.profile.music.enabled && this.model.profile.music.autoplay) player.play();
  }

  destroy(): void {
    window.clearInterval(this.tickTimer);
    window.clearTimeout(this.introTimer);
    window.clearTimeout(this.slotTimer);
    this.stopTyping();
    this.field.destroy();
    cancelAnimationFrame(this.tiltRaf);
    this.grid.destroy();
    this.island?.destroy();
    this.resize?.disconnect();
    this.resize = null;
    this.boxes?.disconnect();
    this.boxes = null;
    this.motionOff?.();
    this.cleanups.forEach(fn => fn());
    player.setQueue([], { loop: false, volume: this.model.profile.music.volume });
    lanyard.ensure(null);
    this.el.remove();
  }

  /* ---------- music and Discord cards ---------- */

  /** Whether the owner is listening to Spotify right now, and the page is set to show it. */
  private spotifyPlaying(): boolean {
    const d = this.model.profile.discord;
    return Boolean(d.enabled && d.showSpotify && lanyard.data?.spotify);
  }

  private collect(): Map<Source, NowPlaying> {
    const p = this.model.profile;
    const out = new Map<Source, NowPlaying>();
    const sp = p.discord.enabled && p.discord.showSpotify ? lanyard.data?.spotify : null;
    // While Spotify is playing, the uploaded songs (and their lyrics) step aside.
    const up = p.music.enabled && !sp ? uploadNowPlaying() : null;
    if (up) out.set("upload", up);
    if (sp) out.set("spotify", spotifyNowPlaying(sp, p.page.lyricsProvider));
    return out;
  }

  private renderSlot(): void {
    const p = this.model.profile;
    const d = lanyard.data;
    this.nowPlaying = this.collect();

    const spotifyOn = this.nowPlaying.has("spotify");
    if (spotifyOn !== this.spotifyOn) {
      this.spotifyOn = spotifyOn;
      if (spotifyOn) {
        // Stop the uploaded song and close its lyrics, so Spotify's own lyrics can open by their setting.
        if (player.playing) player.pause();
        if (this.openLyrics === "upload") this.openLyrics = null;
        this.lyricsDecided = false;
      } else if (this.openLyrics === "spotify") this.openLyrics = null;
    }

    if (!this.lyricsDecided && this.nowPlaying.size) {
      this.lyricsDecided = true;
      if (this.nowPlaying.has("upload") && p.music.lyricsOpen) this.openLyrics = "upload";
      else if (this.nowPlaying.has("spotify") && p.discord.lyricsOpen) this.openLyrics = "spotify";
    }

    // The regular page has one slot. The free-form page can have one for the music and one
    // for Discord, so the two can sit apart.
    let changed = false;
    for (const slot of this.mount.querySelectorAll<HTMLElement>(".pslot")) {
      const kind = slot.dataset.slot ?? "main";
      if (kind === "lyrics") continue;
      const markup = this.slotHTML(kind, d);
      if (markup === slot.dataset.markup) continue;
      slot.dataset.markup = markup;
      slot.innerHTML = markup;
      changed = true;
      // Cards slide in when a new kind of card shows up (a song starts, Discord answers), not on every small change.
      const kinds = [...this.nowPlaying.keys()].join(",") + (p.discord.enabled && p.discord.showCard && d ? ",presence" : "");
      if (kinds !== slot.dataset.kinds) {
        slot.dataset.kinds = kinds;
        slot.classList.remove("anim");
        void slot.offsetWidth;
        slot.classList.add("anim");
        window.clearTimeout(this.slotTimer);
        this.slotTimer = window.setTimeout(() => slot.classList.remove("anim"), 900);
      }
    }
    // A song or a presence card changes how tall its piece is.
    if (changed) fitFree(this.el);
    this.updateDot();
    this.renderPanel();
    this.tick();
  }

  /** What goes in one slot: the Discord card, the music card, or both. */
  private slotHTML(kind: string, d: PresenceData | null): string {
    const p = this.model.profile;
    const parts: string[] = [];
    const presence = p.discord.enabled && p.discord.showCard && d ? presenceCardHTML(d, p.discord.showActivity) : "";
    if (kind === "music") {
      const up = this.nowPlaying.get("upload");
      if (up) parts.push(nowCardHTML(up, { showProgress: p.music.showProgress, showLyrics: p.music.showLyrics }));
    } else if (kind === "discord") {
      if (presence) parts.push(presence);
      const sp = this.nowPlaying.get("spotify");
      if (sp) parts.push(nowCardHTML(sp, { showProgress: p.discord.showProgress, showLyrics: p.discord.showLyrics }));
    } else {
      if (presence) parts.push(presence);
      for (const [source, np] of this.nowPlaying) {
        const s = source === "upload" ? { showProgress: p.music.showProgress, showLyrics: p.music.showLyrics } : { showProgress: p.discord.showProgress, showLyrics: p.discord.showLyrics };
        parts.push(nowCardHTML(np, s));
      }
    }
    return parts.join("");
  }

  /** The dot under the picture follows the live Discord status. It stays hidden until Lanyard has answered. */
  private updateDot(): void {
    const dot = this.mount.querySelector<HTMLElement>(".pres");
    if (!dot) return;
    const d = lanyard.data;
    const on = this.model.profile.discord.enabled && d;
    dot.hidden = !on;
    if (on) dot.style.background = PRESENCE_COLORS[d.status];
  }

  private lyricStyle(source: Source): LyricStyle {
    const p = this.model.profile;
    return source === "upload" ? p.music.lyricsStyle : p.discord.lyricsStyle;
  }

  private renderPanel(): void {
    const p = this.model.profile;

    // A Lyrics piece on the board holds the lyrics itself, for whatever song is playing, so nothing floats.
    const free = p.page.layout === "experimental";
    const holder = free ? this.mount.querySelector<HTMLElement>('.pslot[data-slot="lyrics"]') : null;
    const source: Source | null = holder
      ? (this.nowPlaying.has("spotify") ? "spotify" : this.nowPlaying.has("upload") ? "upload" : null)
      : this.openLyrics && this.lyricStyle(this.openLyrics) === "panel" ? this.openLyrics : null;
    const panelNp = source ? this.nowPlaying.get(source) : undefined;
    if (!panelNp) {
      this.panel?.el.remove();
      this.panel = null;
    } else {
      const signature = panelSignature(panelNp);
      if (!this.panel || this.panel.signature !== signature) {
        this.panel?.el.remove();
        this.panel = new LyricPanel(panelNp, signature, () => this.toggleLyrics(this.openLyrics));
      }
      // In a Lyrics piece the panel fills it. Otherwise, on the free-form page the panel floats over the
      // board, and on the usual page it sits beside the card.
      this.panel.el.classList.toggle("in-piece", Boolean(holder));
      this.panel.el.classList.toggle("on-free", free && !holder);
      const host = holder ?? (free ? this.el : this.wrap);
      if (this.panel.el.parentElement !== host) host.append(this.panel.el);
      if (holder) fitFree(this.el);
    }

    // The island: always there while a song is on, and opens to show its lyrics.
    const islandSource = holder ? undefined : (["upload", "spotify"] as Source[]).find(x => this.nowPlaying.has(x) && this.lyricStyle(x) === "island");
    const np = islandSource ? this.nowPlaying.get(islandSource) : undefined;
    if (!islandSource || !np) {
      this.island?.destroy();
      this.island = null;
      this.islandSource = null;
      this.el.classList.remove("has-island");
      return;
    }
    const showLyrics = islandSource === "upload" ? p.music.showLyrics : p.discord.showLyrics;
    if (!this.island || this.islandSource !== islandSource) {
      this.island?.destroy();
      this.islandSource = islandSource;
      this.island = new IslandPanel(np, {
        showLyrics,
        onToggle: open => { this.openLyrics = open ? islandSource : null; this.lyricsDecided = true; this.renderPanel(); },
      });
      this.el.append(this.island.el);
    } else {
      this.island.update(np, showLyrics);
    }
    this.el.classList.add("has-island");
    this.island.setOpen(this.openLyrics === islandSource);
  }

  private toggleLyrics(source: Source | null): void {
    this.openLyrics = this.openLyrics === source ? null : source;
    this.lyricsDecided = true;
    this.renderPanel();
    this.tick();
  }

  private tick(): void {
    for (const card of this.mount.querySelectorAll<HTMLElement>(".np-card")) {
      const np = this.nowPlaying.get(card.dataset.np as Source);
      if (np) tickNowCard(card, np);
    }
    this.panel?.tick();
    this.island?.tick();
  }

  private sourceOf(target: HTMLElement): Source | null {
    const card = target.closest<HTMLElement>("[data-np]");
    return (card?.dataset.np as Source | undefined) ?? null;
  }

  private onControl(target: HTMLElement): void {
    const np = this.nowPlaying.get(this.sourceOf(target) ?? "upload");
    const c = np?.controls;
    if (!c) return;
    const act = target.dataset.act;
    if (act === "toggle") c.toggle();
    else if (act === "prev") c.prev();
    else if (act === "next") c.next();
  }

  private onSeek(e: MouseEvent, target: HTMLElement): void {
    const np = this.nowPlaying.get(this.sourceOf(target) ?? "upload");
    if (!np?.controls) return;
    const r = target.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
    np.controls.seek(ratio * np.durationMs);
    this.tick();
  }

  /* ---------- pointer effects ---------- */

  /**
   * Where the card sits when it is not tilted. Measured from layout rather than getBoundingClientRect,
   * because the tilt itself moves the bounding box and that fed back into the tilt (which made it jitter).
   */
  private restRect(): { left: number; top: number; width: number; height: number } {
    const scroll = this.mount.offsetParent as HTMLElement | null;
    const base = (scroll ?? this.el).getBoundingClientRect();
    return {
      left: base.left + this.mount.offsetLeft - (scroll?.scrollLeft ?? 0),
      top: base.top + this.mount.offsetTop - (scroll?.scrollTop ?? 0),
      width: this.mount.offsetWidth,
      height: this.mount.offsetHeight,
    };
  }

  private onPointer(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    const r = this.el.getBoundingClientRect();
    this.field.pointer(e.clientX - r.left, e.clientY - r.top);
    this.grid.pointer(e.clientX - r.left, e.clientY - r.top);
    const p = this.model.profile;
    // The spotlight background follows the pointer.
    if (p.bgType === "spotlight") {
      const fx = this.el.querySelector<HTMLElement>(".fx-bg");
      fx?.style.setProperty("--sx", `${Math.max(0, Math.min(100, ((e.clientX - r.left) / Math.max(1, r.width)) * 100))}%`);
      fx?.style.setProperty("--sy", `${Math.max(0, Math.min(100, ((e.clientY - r.top) / Math.max(1, r.height)) * 100))}%`);
    }
    const m = this.restRect();
    if (p.effects.cursorGlow) {
      // The light lives inside the card, so it only shows while the pointer is over it.
      const inside = e.clientX >= m.left && e.clientX <= m.left + m.width && e.clientY >= m.top && e.clientY <= m.top + m.height;
      this.mount.classList.toggle("lit", inside);
      if (inside) {
        this.mount.style.setProperty("--mx", `${e.clientX - m.left}px`);
        this.mount.style.setProperty("--my", `${e.clientY - m.top}px`);
      }
    }
    if (p.effects.tilt) {
      const clampN = (n: number): number => Math.max(-1, Math.min(1, n));
      this.tiltTo.y = clampN((e.clientX - (m.left + m.width / 2)) / Math.max(1, r.width / 2)) * 10;
      this.tiltTo.x = -clampN((e.clientY - (m.top + m.height / 2)) / Math.max(1, r.height / 2)) * 10;
      this.startTilt();
    }
  }

  /** Eases the card toward the wanted angle once per frame, so quick pointer moves don't make it stutter. */
  private startTilt(): void {
    if (this.tiltRaf) return;
    const step = (): void => {
      this.tiltRaf = 0;
      const t = this.tilt;
      t.x += (this.tiltTo.x - t.x) * 0.18;
      t.y += (this.tiltTo.y - t.y) * 0.18;
      const settled = Math.abs(this.tiltTo.x - t.x) < 0.02 && Math.abs(this.tiltTo.y - t.y) < 0.02;
      if (settled) { t.x = this.tiltTo.x; t.y = this.tiltTo.y; }
      this.mount.style.transform = t.x === 0 && t.y === 0 ? "" : `perspective(900px) rotateY(${t.y.toFixed(2)}deg) rotateX(${t.x.toFixed(2)}deg)`;
      if (!settled) this.tiltRaf = requestAnimationFrame(step);
    };
    this.tiltRaf = requestAnimationFrame(step);
  }

  private onLeave(): void {
    this.field.leave();
    this.grid.leave();
    const fx = this.el.querySelector<HTMLElement>(".fx-bg");
    fx?.style.removeProperty("--sx");
    fx?.style.removeProperty("--sy");
    this.mount.classList.remove("lit");
    this.tiltTo.x = this.tiltTo.y = 0;
    this.startTilt();
  }
}
